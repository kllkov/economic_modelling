# Экономическое моделирование

Сайт курса «Экономическое моделирование» (Центральный университет, направление «Количественная экономика») и симулятор динамических экономических моделей.

**Сайт:** https://kllkov.github.io/economic_modelling/

## Структура

```
site/                      — то, что публикуется на GitHub Pages
  index.html               — главная: информация о курсе, команда
  models.html              — плитка моделей и симулятор
  assets/css/style.css     — стили
  assets/js/app.js         — интерфейс: плитки, окно настроек, вывод результатов
  assets/js/charts.js      — графики (Chart.js)
  assets/js/solver.js      — метод Ньютона для perfect-foresight систем (трёхдиагональный якобиан)
  assets/js/models/
    registry.js            — каталог моделей и заглушки
    ramsey.js              — модель Рамсея: настройки, решатель, формулы
  assets/vendor/           — KaTeX, Chart.js и шрифты (локальные копии)
tests/ramsey.test.js       — проверка решателя против чисел из лекции
.github/workflows/pages.yml — автодеплой на GitHub Pages при пуше в main
```

## Как добавить модель

Модель — это ES-модуль с экспортами `meta`, `defaults`, `controls`, `normalize`, `solve`, `formulas`, `steadyTable`, `chartSpecs` (см. `ramsey.js`). В `registry.js` у модели появляется поле `load: () => import('./имя.js')`, и плитка становится активной.

## Тесты

```
node tests/ramsey.test.js        # стационар и седловая траектория против чисел из лекции, все комбинации настроек
node tests/verify.mjs            # аналитические решения (ln, δ=1), сходимость по шагу и горизонту, инвариантность к сдвигу даты
python3 tests/independent_scipy.py   # независимый решатель на scipy (запускать после verify.mjs)
```
