# Где лежит ML

В текущем сайте ML используется для представления текста: RuBERT превращает запрос и описания ЖК в эмбеддинги. Рекомендации — прямой независимый скор сходства; обучаемого предсказателя рекомендаций нет.

| Что | Файл / папка |
| --- | --- |
| Расчёт итогового скора, косинус, выбор лота | [src/recommender.mjs](../src/recommender.mjs) |
| Интерфейс диапазона цены (не ML) | [src/price-range.mjs](../src/price-range.mjs) |
| Признак срока сдачи и проверка фильтров | [src/matcher.mjs](../src/matcher.mjs) |
| Токенизация, загрузка и запуск RuBERT в браузере | [src/semantic-encoder.mjs](../src/semantic-encoder.mjs) |
| Веса ONNX, метаданные, словарь и эмбеддинги ЖК | [src/ml-assets/](../src/ml-assets/) |
| Описания и источники до векторизации | [data/profiles.json](../data/profiles.json) |
| Экспорт готовой модели в ONNX | [ml/export_encoder.py](export_encoder.py) |
| Проверочные векторы и токены | [ml/encoder-fixtures.json](encoder-fixtures.json) |
| Проверки скора и энкодера | [tests/recommender.test.mjs](../tests/recommender.test.mjs) |
| Проверки срока сдачи | [tests/delivery.test.mjs](../tests/delivery.test.mjs) |
| Описание формулы и ограничений | [docs/model-card.md](../docs/model-card.md) |
| Старый случайный лес, синтетические сценарии и метрики | [ml/legacy-random-forest/](legacy-random-forest/) — архив, сайтом не используется |

В `src/ml-assets/encoder.json` записаны ревизия модели, имена частей весов и SHA-256. В `src/ml-assets/profiles.json` находятся готовые векторы 15 ЖК. В `dist/` сборка копирует только необходимые браузеру файлы; менять исходники нужно в `src/`.
