"""Export the pinned Russian sentence encoder for local browser inference."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'cointegrated/rubert-tiny2'
REVISION = 'e8ed3b0c8bbf4fb6984c3de043bf7d2f4e5969ae'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-path', default=MODEL)
    args = parser.parse_args()
    torch.set_num_threads(2)
    tokenizer = AutoTokenizer.from_pretrained(args.model_path, revision=REVISION)
    model = AutoModel.from_pretrained(args.model_path, revision=REVISION, attn_implementation='eager').eval()

    class Encoder(torch.nn.Module):
        def __init__(self, bert):
            super().__init__()
            self.bert = bert
        def forward(self, input_ids, attention_mask, token_type_ids):
            hidden = self.bert(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids).last_hidden_state
            return torch.nn.functional.normalize(hidden[:, 0, :], p=2, dim=1)

    wrapper = Encoder(model).eval()
    temp = ROOT / 'outputs/ml-tools'
    target = ROOT / 'src/ml-assets'
    temp.mkdir(parents=True, exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)
    sample = tokenizer('Квартира у реки, парк и двор без машин', return_tensors='pt')
    inputs = tuple(sample[name] for name in ['input_ids','attention_mask','token_type_ids'])
    full = temp / 'rubert-fp32.onnx'
    quant = temp / 'rubert-int8.onnx'
    torch.onnx.export(wrapper, inputs, str(full), opset_version=17, dynamo=False,
        input_names=['input_ids','attention_mask','token_type_ids'], output_names=['embedding'],
        dynamic_axes={name:{0:'batch',1:'sequence'} for name in ['input_ids','attention_mask','token_type_ids']} | {'embedding':{0:'batch'}})
    quantize_dynamic(str(full), str(quant), weight_type=QuantType.QUInt8, op_types_to_quantize=['MatMul','Gather'])
    session = ort.InferenceSession(str(quant), providers=['CPUExecutionProvider'])
    cases = ['тихий двор рядом с парком','Хочу жить у моря','Петроградский район исторический центр','Шагал','детский сад и школа рядом']
    scores=[]
    for text in cases:
        tokens = tokenizer(text, return_tensors='pt', truncation=True, max_length=128)
        with torch.no_grad(): expected=wrapper(**tokens).numpy()[0]
        got=session.run(None,{k:v.numpy() for k,v in tokens.items()})[0][0]
        scores.append(float(expected @ got / np.linalg.norm(got)))
    if min(scores) < .97: raise RuntimeError(f'Encoder quantization drift: {scores}')
    raw = quant.read_bytes()
    # Every static asset stays below the hosting provider's per-file size cap.
    chunks=[]
    for index,start in enumerate(range(0,len(raw),8*1024*1024)):
        name=f'rubert-int8-{index}.bin'
        payload=raw[start:start+8*1024*1024]
        (target/name).write_bytes(payload)
        chunks.append({'file':name,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
    vocab=tokenizer.get_vocab()
    ordered=['']*len(vocab)
    for token,index in vocab.items(): ordered[index]=token
    (target/'vocab.json').write_text(json.dumps(ordered,ensure_ascii=False,separators=(',',':')))
    manifest={'model':MODEL,'revision':REVISION,'license':'MIT','pooling':'L2-normalized CLS','dimension':312,'maxLength':128,
        'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'chunks':chunks,'quantizationCosines':scores,
        'specialTokens':{'pad':tokenizer.pad_token_id,'unk':tokenizer.unk_token_id,'cls':tokenizer.cls_token_id,'sep':tokenizer.sep_token_id}}
    (target/'encoder.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'bytes':len(raw),'chunks':len(chunks),'minQuantizationCosine':min(scores)}))

if __name__ == '__main__': main()
