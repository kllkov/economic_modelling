// Каталог моделей: описание («О модели») и симулятор (load).
// Модели без load — заглушки: на странице симуляции показывается список planned, «О модели» — только картинка.
// В текстах фрагменты между $…$ рендерятся KaTeX; eq — формулы в выключном режиме.

export const MODELS = [
  {
    id: 'fisher',
    title: 'Модель Фишера',
    subtitle: 'Fisher intertemporal choice model',
    blurb: 'Распределение потребления во времени при экзогенной ставке процента: уравнение Эйлера и пожизненное бюджетное ограничение.',
    tags: ['Потребление', 'Межвременной выбор'],
    glyph: 'budget',
    load: () => import('./fisher.js'),
    about: {
      lead: [
        'Модель Фишера описывает, как домохозяйство распределяет потребление во времени, когда ставка процента $r$ задана извне. В версии с бесконечным горизонтом домохозяйство планирует бесконечно долго — например, потому что заботится о потреблении потомков.',
        'Решение распадается на две части. Уравнение Эйлера задаёт наклон траектории потребления: оно сравнивает предельную полезность сегодня и завтра и не зависит от богатства. Пожизненное бюджетное ограничение задаёт уровень: приведённая стоимость потребления равна пожизненному богатству — финансовым активам и приведённой стоимости зарплат.',
        'При CRRA-полезности домохозяйство в любой момент потребляет постоянную долю оставшегося богатства. Поэтому временное изменение зарплаты почти не меняет потребление, а перманентное меняет его почти один к одному.',
        'Модель Фишера — строительный блок модели Рамсея: в Рамсее ставка процента становится эндогенной (она равна предельному продукту капитала), и пожизненное ограничение уже нельзя записать заранее.',
      ],
      sections: [
        { title: 'Задача домохозяйства (дискретное время)', eqs: [
          { label: 'Полезность', tex: '\\max_{\\{c_t\\}}\\ V_0=\\sum_{t=0}^{\\infty}\\beta^t u(c_t),\\qquad \\beta=\\dfrac{1}{1+\\rho}' },
          { label: 'Бюджетное ограничение', tex: 'b_{t+1}=(1+r)b_t+w_t-c_t,\\qquad \\lim_{t\\to\\infty}\\dfrac{b_t}{(1+r)^t}=0\\ \\text{(TVC)}' },
          { label: 'Пожизненное ограничение', tex: '\\sum_{t=0}^{\\infty}\\dfrac{c_t}{(1+r)^t}=(1+r)b_0+\\sum_{t=0}^{\\infty}\\dfrac{w_t}{(1+r)^t}\\equiv W_0' },
          { label: 'Лагранжиан', tex: '\\mathcal L=\\sum_{t=0}^{\\infty}\\beta^t u(c_t)+\\lambda\\Big(W_0-\\sum_{t=0}^{\\infty}\\dfrac{c_t}{(1+r)^t}\\Big)' },
        ] },
        { title: 'Оптимальное потребление', eqs: [
          { label: 'Уравнение Эйлера', tex: '\\dfrac{u\'(c_t)}{u\'(c_{t+1})}=\\beta(1+r)' },
          { label: 'CRRA', tex: 'c_{t+s}=c_t\\big[\\beta(1+r)\\big]^{s/\\sigma},\\qquad c_t=\\dfrac{(1+r)-\\big[\\beta(1+r)\\big]^{1/\\sigma}}{1+r}W_t' },
          { label: 'Богатство в момент $t$', tex: 'W_t=(1+r)b_t+\\sum_{s=0}^{\\infty}\\dfrac{w_{t+s}}{(1+r)^s}' },
        ] },
        { title: 'Непрерывное время', eqs: [
          { label: 'Задача', tex: '\\max_{\\{c_t\\}_{t\\ge0}}\\int_0^{\\infty}e^{-\\rho t}u(c_t)\\,dt\\quad\\text{s.t.}\\quad \\dot b_t=r\\cdot b_t+w_t-c_t' },
          { label: 'Уравнение Эйлера', tex: '\\dfrac{\\dot c_t}{c_t}=\\dfrac{r-\\rho}{\\sigma}' },
          { label: 'CRRA', tex: 'c_0=\\dfrac{\\rho-(1-\\sigma)r}{\\sigma}\\Big(b_0+\\int_0^{\\infty}e^{-rt}w_t\\,dt\\Big)' },
        ] },
      ],
      refs: [
        'Fisher I. (1930). <i>The Theory of Interest</i>. New York: Macmillan.',
        'Friedman M. (1957). <i>A Theory of the Consumption Function</i>. Princeton: Princeton University Press.',
      ],
    },
  },
  {
    id: 'solow',
    title: 'Модель Солоу',
    subtitle: 'Solow–Swan model',
    blurb: 'Накопление капитала при постоянной норме сбережения, технологический прогресс и сходимость к траектории сбалансированного роста.',
    tags: ['Рост', 'Накопление капитала'],
    glyph: 'concave',
    load: () => import('./solow.js'),
    about: {
      lead: [
        'Модель Солоу — модель экзогенного экономического роста. В экономике производится один товар по неоклассической производственной функции $Y=F(K,EL)$ с постоянной отдачей от масштаба по капиталу и труду. Домохозяйства сберегают постоянную долю дохода $s$, население растёт темпом $n$, технология — темпом $g$, капитал выбывает с нормой $\\delta$; все эти величины заданы экзогенно.',
        'Технологический прогресс трудосберегающий (нейтральный по Харроду): $E$ умножает труд, и $EL$ — число условных (эффективных) единиц труда. По теореме Узавы только при таком прогрессе существует траектория сбалансированного роста с постоянным отношением капитала к выпуску.',
        'Благодаря постоянной отдаче от масштаба модель сводится к одному уравнению для капиталовооружённости эффективного труда $\\tilde k=K/(EL)$. Пока капитала мало, он продуктивен и инвестиции превышают выбытие — экономика растёт; когда капитала много, дополнительный продукт не покрывает выбытие. Поэтому экономика сходится к стационарному состоянию $\\tilde k^*$, то есть к траектории сбалансированного роста.',
        'На ТСР $\\tilde k$, $\\tilde y$, $\\tilde c$ постоянны, выпуск, капитал и потребление растут темпом $n+g$, а выпуск и капитал на работника и зарплата — темпом $g$. Рост нормы сбережения даёт лишь временное ускорение роста и более высокий уровень выпуска на работника (эффект уровня); долгосрочный темп роста определяется только $g$ (эффект роста). Модель предсказывает условную, но не абсолютную конвергенцию и не имеет «эффекта колеи»: с любой начальной точки экономика возвращается на ТСР.',
        'Децентрализованная версия (фирмы, домохозяйства и рынок капитала) приводит к тому же основному уравнению динамики, что и централизованная, поэтому стационарное состояние можно считать равновесием. Прибыль фирм при этом равна нулю, а доход целиком распределяется между трудом и капиталом.',
        'В симуляторе в дискретном времени закон движения записан точно: $(1+n)(1+g)\\tilde k_{t+1}=(1-\\delta)\\tilde k_t+s f(\\tilde k_t)$. В лекции используется приближение $(1+n)(1+g)\\approx 1+n+g$; при малых $n$ и $g$ различие пренебрежимо.',
      ],
      sections: [
        { title: 'Производство', eqs: [
          { label: 'Производственная функция', tex: 'Y=F(K,EL),\\qquad \\lambda Y=F(\\lambda K,E\\lambda L)\\ \\ \\text{(CRS)}' },
          { label: 'Интенсивная форма', tex: '\\tilde y=\\dfrac{Y}{EL}=F\\Big(\\dfrac{K}{EL},1\\Big)=f(\\tilde k),\\qquad f(0)=0,\\ \\ f^{\\prime}>0,\\ \\ f^{\\prime\\prime}<0' },
          { label: 'Условия Инады', tex: '\\lim_{\\tilde k\\to 0}f^{\\prime}(\\tilde k)=+\\infty,\\qquad \\lim_{\\tilde k\\to\\infty}f^{\\prime}(\\tilde k)=0' },
          { label: 'Экзогенные процессы', tex: '\\dfrac{\\dot L_t}{L_t}=n,\\qquad \\dfrac{\\dot E_t}{E_t}=g' },
        ] },
        { title: 'Основное уравнение динамики', eqs: [
          { label: 'Накопление капитала', tex: '\\dot K_t=sY_t-\\delta K_t\\qquad (I=S:\\ \\dot K_t+\\delta K_t=sY_t)' },
          { label: 'В эффективных единицах', tex: '\\dot{\\tilde k}_t=s\\cdot f(\\tilde k_t)-(n+g+\\delta)\\tilde k_t' },
          { label: 'Дискретное время', tex: '(1+n)(1+g)\\tilde k_{t+1}=(1-\\delta)\\tilde k_t+s\\cdot f(\\tilde k_t)' },
          { label: 'Устойчивость', tex: '\\dfrac{\\partial\\dot{\\tilde k}}{\\partial\\tilde k}\\Big|_{\\tilde k^*}<0' },
        ] },
        { title: 'Децентрализованная версия', eqs: [
          { label: 'Фирмы', tex: '\\max_{K,L}\\ \\pi=F(K,EL)-wL-(r+\\delta)K' },
          { label: 'Цены факторов', tex: 'f^{\\prime}(\\tilde k)=r+\\delta,\\qquad w=E\\big(f(\\tilde k)-f^{\\prime}(\\tilde k)\\tilde k\\big),\\qquad \\pi=0' },
          { label: 'Домохозяйства', tex: '\\tilde c_t=(1-s)\\tilde y_t,\\qquad \\dot{\\tilde b}_t=(r_t-n-g)\\tilde b_t+\\tilde w_t-\\tilde c_t' },
          { label: 'Рынок капитала', tex: '\\tilde b_t=\\tilde k_t\\ \\Rightarrow\\ \\dot{\\tilde k}_t=s\\cdot f(\\tilde k_t)-(n+g+\\delta)\\tilde k_t' },
        ] },
        { title: 'Траектория сбалансированного роста', eqs: [
          { label: 'Стационар', tex: 's\\cdot f(\\tilde k^*)=(n+g+\\delta)\\tilde k^*' },
          { label: 'Темпы роста', tex: 'g_{\\tilde y}=g_{\\tilde k}=g_{\\tilde c}=0,\\qquad g_Y=g_K=g_C=n+g,\\qquad g_{Y/L}=g_{K/L}=g_w=g' },
          { label: 'Постоянные величины', tex: 'r^*=f^{\\prime}(\\tilde k^*)-\\delta,\\qquad \\dfrac{K}{Y}=\\dfrac{\\tilde k^*}{f(\\tilde k^*)}' },
        ] },
        { title: 'Золотое правило накопления', eqs: [
          { label: 'Задача', tex: '\\tilde c^*=f\\big(\\tilde k^*(s)\\big)-(n+g+\\delta)\\tilde k^*(s)\\ \\to\\ \\max_s' },
          { label: 'Условие', tex: 'f^{\\prime}(\\tilde k_{GR})=n+g+\\delta,\\qquad s_{GR}=\\dfrac{f^{\\prime}(\\tilde k_{GR})\\tilde k_{GR}}{f(\\tilde k_{GR})}' },
          { label: 'Кобб–Дуглас', tex: 'f(\\tilde k)=\\tilde k^{\\alpha}\\ \\Rightarrow\\ s_{GR}=\\alpha' },
          { label: 'Динамическая эффективность', tex: 's<s_{GR}\\ \\Leftrightarrow\\ r^*>n+g\\qquad\\text{(при } s>s_{GR}\\text{ — динамическая неэффективность)}' },
        ] },
      ],
      refs: [
        'Solow R. M. (1956). A Contribution to the Theory of Economic Growth. <i>Quarterly Journal of Economics</i>, 70(1), 65–94.',
        'Swan T. W. (1956). Economic Growth and Capital Accumulation. <i>Economic Record</i>, 32(2), 334–361.',
        'Uzawa H. (1961). Neutral Inventions and the Stability of Growth Equilibrium. <i>Review of Economic Studies</i>, 28(2), 117–124.',
        'Phelps E. S. (1961). The Golden Rule of Accumulation: A Fable for Growthmen. <i>American Economic Review</i>, 51(4), 638–643.',
      ],
    },
  },
  {
    id: 'olg',
    title: 'OLG',
    subtitle: 'Overlapping Generations model (Diamond)',
    blurb: 'Молодые работают и сберегают, старые потребляют накопленное: динамическая неэффективность и пенсионные системы.',
    tags: ['Поколения', 'Сбережения'],
    glyph: 'steps',
    planned: [
      ['Время', 'дискретное (поколения)'],
      ['Вид модели', 'децентрализованная / социальный планировщик'],
      ['Вариации', 'без пенсий; распределительная (PAYG); накопительная пенсионная система'],
      ['Шоки', 'state: капитал; параметры: $\\beta$, $n$, уровень технологии'],
      ['Функции', 'полезность CRRA / логарифмическая; производство Кобба–Дугласа'],
    ],
  },
  {
    id: 'ramsey',
    title: 'Модель Рамсея',
    subtitle: 'Ramsey–Cass–Koopmans model',
    blurb: 'Оптимальный выбор между потреблением и сбережением: домохозяйства, фирмы и рынок капитала или центральный планировщик.',
    tags: ['Рост', 'Межвременной выбор', 'Накопление капитала'],
    glyph: 'saddle',
    load: () => import('./ramsey.js'),
    about: {
      lead: [
        'Модель Рамсея соединяет межвременной выбор Фишера с накоплением капитала. Норма сбережения больше не задана: домохозяйства выбирают траекторию потребления, максимизируя дисконтированную полезность, а ставка процента $r_t$ становится эндогенной — она определяется предельным продуктом капитала.',
        'Население (оно же рабочая сила) растёт темпом $n$: $L_{t+1}=(1+n)L_t$. Целевая функция домохозяйства может учитывать полезность на душу (Милль) или сумму полезностей всех членов (Бентам). От этого выбора зависит эффективный дисконт и стационарная ставка процента.',
        'Модель решается в двух версиях. В децентрализованной домохозяйства владеют капиталом и сдают его фирмам в аренду за $r_t+\\delta$, получают зарплату $w_t$ и прибыль фирм $\\pi_t$; домохозяйства и фирмы действуют по отдельности и связаны рынками капитала и труда. В централизованной планировщик напрямую распоряжается всем капиталом экономики. Без провалов рынка обе версии дают одни и те же уравнения динамики.',
        'Динамика описывается системой из уравнения Эйлера и уравнения накопления капитала. Стационарное состояние — седловая точка: при заданном $k_0$ существует единственное начальное потребление $c_0$, выводящее экономику на седловую траекторию. Модель различает ожидаемые и неожиданные шоки: при ожидаемом шоке реакция начинается в момент объявления.',
        'Технологический прогресс вводится как трудосберегающий (по Харроду): только в этом случае существует траектория сбалансированного роста (теорема Узавы).',
        'В симуляторе законы движения записаны точно: $(1+n)(1+g)\\tilde k_{t+1}=(1-\\delta)\\tilde k_t+f(\\tilde k_t)-\\tilde c_t$. В лекции в дискретном времени используется приближение $(1+n)(1+g)\\approx 1+n+g$, то есть $\\tilde k_{t+1}=(1-\\delta-n-g)\\tilde k_t+f(\\tilde k_t)-\\tilde c_t$; при малых $n$ и $g$ различие пренебрежимо.',
      ],
      sections: [
        { title: 'Децентрализованная экономика (дискретное время)', eqs: [
          { label: 'Домохозяйства (Милль)', tex: '\\max_{\\{c_t,\\,k_{t+1}\\}}\\ \\sum_{t=0}^{\\infty}\\beta^t u(c_t)\\quad\\text{s.t.}\\quad (1+n)k_{t+1}=(1-\\delta)k_t+(r_t+\\delta)k_t+w_t+\\pi_t-c_t' },
          { label: 'Домохозяйства (Бентам)', tex: '\\max_{\\{c_t,\\,k_{t+1}\\}}\\ \\sum_{t=0}^{\\infty}\\beta^t L_t u(c_t),\\qquad L_{t+1}=(1+n)L_t' },
          { label: 'Фирмы', tex: '\\max_{K_t,L_t}\\ \\pi_t=F(K_t,L_t)-w_tL_t-(r_t+\\delta)K_t' },
          { label: 'Спрос на капитал и труд', tex: 'r_t=f\'(k_t)-\\delta,\\qquad w_t=f(k_t)-f\'(k_t)k_t,\\qquad \\pi_t=0' },
          { label: 'Рынок капитала', tex: 'k_t^D=k_t^S' },
          { label: 'Рынок труда', tex: 'L_t^D=L_t^S' },
        ] },
        { title: 'Централизованная экономика', eqs: [
          { label: 'Планировщик', tex: '\\max_{\\{c_t,\\,k_{t+1}\\}}\\ \\sum_{t=0}^{\\infty}\\beta^t u(c_t)\\quad\\text{s.t.}\\quad (1+n)k_{t+1}=(1-\\delta)k_t+f(k_t)-c_t' },
        ] },
        { title: 'Система равновесия', eqs: [
          { label: 'Уравнение Эйлера (Милль)', tex: '(1+n)u\'(c_t)=\\beta u\'(c_{t+1})\\left[1+f\'(k_{t+1})-\\delta\\right]' },
          { label: 'Уравнение Эйлера (Бентам)', tex: 'u\'(c_t)=\\beta u\'(c_{t+1})\\left[1+f\'(k_{t+1})-\\delta\\right]' },
          { label: 'Динамика капитала', tex: '(1+n)k_{t+1}=(1-\\delta)k_t+f(k_t)-c_t' },
          { label: 'Непрерывное время (Милль; у Бентама без $-n$)', tex: '\\dfrac{\\dot c_t}{c_t}=\\dfrac{f\'(k_t)-\\delta-\\rho-n}{\\sigma(c_t)},\\qquad \\dot k_t=f(k_t)-c_t-(n+\\delta)k_t,\\qquad \\sigma(c)=-\\dfrac{c\\cdot u\'\'(c)}{u\'(c)}' },
        ] },
        { title: 'Стационарное состояние', eqs: [
          { label: 'Милль', tex: 'f\'(k^*)=\\dfrac{1+n}{\\beta}-1+\\delta,\\qquad c^*=f(k^*)-(n+\\delta)k^*' },
          { label: 'Бентам', tex: 'f\'(k^*)=\\dfrac{1}{\\beta}-1+\\delta' },
          { label: 'С ТП, Милль', tex: 'f\'(\\tilde k^*)=\\dfrac{(1+n)(1+g)^{\\sigma}}{\\beta}-1+\\delta,\\qquad \\tilde c^*=f(\\tilde k^*)-\\big[(1+n)(1+g)-1+\\delta\\big]\\tilde k^*' },
        ] },
      ],
      refs: [
        'Ramsey F. P. (1928). A Mathematical Theory of Saving. <i>The Economic Journal</i>, 38(152), 543–559.',
        'Cass D. (1965). Optimum Growth in an Aggregative Model of Capital Accumulation. <i>Review of Economic Studies</i>, 32(3), 233–240.',
        'Koopmans T. C. (1965). On the Concept of Optimal Economic Growth. In <i>The Econometric Approach to Development Planning</i>. Amsterdam: North-Holland, 225–287.',
        'Uzawa H. (1961). Neutral Inventions and the Stability of Growth Equilibrium. <i>Review of Economic Studies</i>, 28(2), 117–124.',
      ],
    },
  },
  {
    id: 'rbc',
    title: 'RBC',
    subtitle: 'Real Business Cycle model',
    blurb: 'Колебания выпуска, часов и инвестиций вокруг тренда в ответ на персистентные шоки технологии.',
    tags: ['Цикл', 'Шоки технологии'],
    glyph: 'cycle',
    load: () => import('./rbc.js'),
    about: {
      lead: [
        'Модель реальных деловых циклов (Real Business Cycle, RBC) — модель Рамсея с двумя добавками: выбором между досугом $1-N_t$ и потреблением и общефакторной производительностью $A_t$, которая колеблется вокруг нормы. Деловой цикл в ней — отклонения агрегированных показателей от тренда и их совместное движение.',
        'Импульс — шок технологии: $\\ln A_{t+1}=\\rho\\ln A_t+\\varepsilon_{t+1}$, персистентность $\\rho$ показывает, какая доля отклонения переходит в следующий период. Механизм распространения — накопление капитала (шок сегодня меняет капитал завтра) и межвременное замещение труда (работать больше, когда работа временно выгоднее).',
        'Цены гибкие, внешних эффектов нет, поэтому по первой теореме благосостояния децентрализованное равновесие совпадает с решением центрального планировщика: колебания — оптимальный ответ на реальные шоки.',
        'Система уравнений равновесия нелинейна, поэтому её лог-линеаризуют около стационарного состояния и находят функции политики: потребление, часы и капитал завтра — линейные функции состояния $(\\hat K_t,\\hat A_t)$. Переключатель Solver выбирает способ решения: лог-линейный (как в лекции; на странице появляются лог-линеаризованная система и функции политики) или нелинейный (точное решение исходных уравнений при совершенном предвидении).',
        'Тренды включаются по отдельности или вместе: рост населения $L_t$ (величины на душу), трудосберегающий ТП $E_t$ (величины на эффективного работника, с тильдой) или оба. Траектория сбалансированного роста существует, если полезность логарифмическая по потреблению (условие King — Plosser — Rebelo): часы на ТСР постоянны, а величины на эффективного работника стационарны. В симуляторе множитель $(1+n)(1+g)$ записан точно; в лекции используется приближение $1+n+g$.',
      ],
      sections: [
        { title: 'Домохозяйство и фирма', eqs: [
          { label: 'Домохозяйство', tex: '\\max_{\\{C_t,\\,N_t,\\,K_{t+1}\\}}\\ \\sum_{t=0}^{\\infty}\\beta^t\\big[u(C_t)-v(N_t)\\big]\\quad\\text{s.t.}\\quad C_t+K_{t+1}=w_tN_t+(1+r_t)K_t+\\Pi_t' },
          { label: 'Условия первого порядка', tex: 'u^{\\prime}(C_t)=\\lambda_t,\\qquad \\lambda_t=\\beta\\lambda_{t+1}(1+r_{t+1}),\\qquad v^{\\prime}(N_t)=\\lambda_tw_t' },
          { label: 'Эластичность Фриша', tex: '\\eta=\\dfrac{v^{\\prime}(N_t)}{N_tv^{\\prime\\prime}(N_t)},\\qquad v(N_t)=\\theta\\dfrac{N_t^{1+\\chi}}{1+\\chi}\\ \\Rightarrow\\ \\eta=\\dfrac{1}{\\chi}' },
          { label: 'Фирма', tex: '\\max_{K_t,\\,N_t}\\ \\Pi_t=A_tF(K_t,N_t)-w_tN_t-(r_t+\\delta)K_t' },
        ] },
        { title: 'Равновесие', eqs: [
          { label: 'Уравнение Эйлера', tex: 'u^{\\prime}(C_t)=\\beta(1+r_{t+1})u^{\\prime}(C_{t+1})' },
          { label: '«Труд — досуг»', tex: 'v^{\\prime}(N_t)=u^{\\prime}(C_t)w_t' },
          { label: 'Спрос на труд и капитал', tex: 'w_t=A_tF^{\\prime}_N(K_t,N_t),\\qquad r_t+\\delta=A_tF^{\\prime}_K(K_t,N_t)' },
          { label: 'Ресурсы и накопление', tex: 'Y_t=A_tF(K_t,N_t)=C_t+I_t,\\qquad K_{t+1}=I_t+(1-\\delta)K_t' },
          { label: 'Технология', tex: '\\ln A_{t+1}=\\rho\\ln A_t+\\varepsilon_{t+1}' },
        ] },
        { title: 'Стационарное состояние: логарифмическая полезность и Кобб–Дуглас', eqs: [
          { label: 'Ставка и капитал', tex: 'r^*=\\dfrac{1}{\\beta}-1,\\qquad \\dfrac{K^*}{N^*}=\\left(\\dfrac{\\alpha}{r^*+\\delta}\\right)^{\\frac{1}{1-\\alpha}},\\qquad w^*=(1-\\alpha)\\left(\\dfrac{K^*}{N^*}\\right)^{\\alpha}' },
          { label: 'Часы', tex: '\\dfrac{C^*}{N^*}=\\left(\\dfrac{K^*}{N^*}\\right)^{\\alpha}-\\delta\\dfrac{K^*}{N^*},\\qquad N^*=\\left(\\dfrac{w^*}{\\theta\\cdot C^*/N^*}\\right)^{\\frac{1}{1+\\chi}}' },
        ] },
        { title: 'Лог-линейная система', eqs: [
          { label: 'Лог-отклонение', tex: '\\hat X_t\\equiv\\ln X_t-\\ln X^*\\approx\\dfrac{X_t-X^*}{X^*},\\qquad \\Delta r_t=r_t-r^*' },
          { label: 'Эйлер и «труд — досуг»', tex: '\\hat C_{t+1}-\\hat C_t=\\beta\\Delta r_{t+1},\\qquad \\chi\\hat N_t=\\hat w_t-\\hat C_t' },
          { label: 'Фирма', tex: '\\hat w_t=\\hat Y_t-\\hat N_t,\\qquad \\Delta r_t=(r^*+\\delta)(\\hat Y_t-\\hat K_t),\\qquad \\hat Y_t=\\hat A_t+\\alpha\\hat K_t+(1-\\alpha)\\hat N_t' },
          { label: 'Ресурсы и накопление', tex: 'Y^*\\hat Y_t=C^*\\hat C_t+I^*\\hat I_t,\\qquad \\hat K_{t+1}=\\delta\\hat I_t+(1-\\delta)\\hat K_t,\\qquad \\hat A_{t+1}=\\rho\\hat A_t' },
        ] },
        { title: 'Функции политики', eqs: [
          { label: 'Потребление, капитал, часы', tex: '\\hat C_t=\\eta_{CK}\\hat K_t+\\eta_{CA}\\hat A_t,\\qquad \\hat K_{t+1}=\\eta_{KK}\\hat K_t+\\eta_{KA}\\hat A_t,\\qquad \\hat N_t=\\eta_{NK}\\hat K_t+\\eta_{NA}\\hat A_t' },
          { label: 'Метод', tex: '\\text{коэффициенты }\\eta\\text{ — методом неопределённых коэффициентов; берётся устойчивый корень, }|\\eta_{KK}|<1' },
        ] },
        { title: 'Полезность с логарифмом досуга', eqs: [
          { label: 'Полезность', tex: 'u=\\ln C_t+\\theta\\ln(1-N_t),\\qquad \\dfrac{\\theta C_t}{1-N_t}=w_t' },
          { label: 'Стационар', tex: 'N^*=\\dfrac{w^*}{w^*+\\theta\\,C^*/N^*}' },
          { label: '«Труд — досуг» в логарифмах', tex: '\\dfrac{N^*}{1-N^*}\\hat N_t=\\hat w_t-\\hat C_t' },
        ] },
        { title: 'С трендами', eqs: [
          { label: 'Тренды', tex: 'L_{t+1}=(1+n)L_t,\\qquad E_{t+1}=(1+g)E_t,\\qquad Y_t=A_tK_t^{\\alpha}(E_tL_tN_t)^{1-\\alpha}' },
          { label: 'Только рост населения', tex: '(1+n)c_{t+1}=\\beta(1+r_{t+1})c_t,\\qquad (1+n)k_{t+1}=i_t+(1-\\delta)k_t,\\qquad k_t=K_t/L_t' },
          { label: 'Оба тренда: Эйлер и накопление', tex: '(1+n)(1+g)\\tilde c_{t+1}=\\beta(1+r_{t+1})\\tilde c_t,\\qquad (1+n)(1+g)\\tilde k_{t+1}=\\tilde i_t+(1-\\delta)\\tilde k_t' },
          { label: 'ТСР', tex: 'r^*=\\dfrac{(1+n)(1+g)}{\\beta}-1,\\qquad \\tilde i^*=\\big[(1+n)(1+g)-1+\\delta\\big]\\tilde k^*,\\qquad N_t=N^*' },
        ] },
      ],
      refs: [
        'Kydland F. E., Prescott E. C. (1982). Time to Build and Aggregate Fluctuations. <i>Econometrica</i>, 50(6), 1345–1370.',
        'Long J. B., Plosser C. I. (1983). Real Business Cycles. <i>Journal of Political Economy</i>, 91(1), 39–69.',
        'King R. G., Plosser C. I., Rebelo S. T. (1988). Production, Growth and Business Cycles: I. The Basic Neoclassical Model. <i>Journal of Monetary Economics</i>, 21(2–3), 195–232.',
        'Prescott E. C. (1986). Theory Ahead of Business-Cycle Measurement. <i>Federal Reserve Bank of Minneapolis Quarterly Review</i>, 10(4), 9–22.',
        'King R. G., Rebelo S. T. (1999). Resuscitating Real Business Cycles. In <i>Handbook of Macroeconomics</i>, vol. 1B. Amsterdam: Elsevier, 927–1007.',
      ],
    },
  },
  {
    id: 'is-pc-mpr',
    title: 'IS–PC–MPR',
    subtitle: 'Three-equation New Keynesian model',
    blurb: 'Динамическая кривая IS, кривая Филлипса и правило денежно-кредитной политики: инфляция, разрыв выпуска и ставка центрального банка.',
    tags: ['Монетарная политика', 'Инфляция'],
    glyph: 'damped',
    load: () => import('./ispcmpr.js'),
    wip: true,
    about: {
      lead: [
        'Трёхуравненная новокейнсианская модель описывает краткосрочную динамику выпуска и инфляции при жёстких ценах. Домохозяйства выбирают потребление, труд, реальные денежные остатки и облигации; монополистически конкурентные фирмы пересматривают цены по Кальво — в каждом периоде с вероятностью $1-\\theta$.',
        'Лог-линеаризация условий оптимальности вокруг стационара даёт три уравнения: динамическую кривую IS (Dynamic IS) для разрыва выпуска $\\tilde y_t$, новокейнсианскую кривую Филлипса для инфляции $\\pi_t$ и правило денежно-кредитной политики (MPR) для номинальной ставки $i_t$. Наклон кривой Филлипса $\\kappa$ выражается через структурные параметры.',
        'Модель лог-линеаризована вокруг стационара с нулевой инфляцией; центральный банк реагирует на инфляцию и разрыв выпуска. В симуляторе ожидания агентов задаются одним из трёх правил: наивные (равны цели центрального банка, то есть нулю), адаптивные (обучение с коэффициентом $\\gamma$) и рациональные.',
      ],
      sections: [
        { title: 'Домохозяйства', eqs: [
          { label: 'Задача', tex: '\\max_{C_t,\\,N_t,\\,\\frac{M_t}{P_t},\\,B_t}\\ \\mathbb E_0\\Big\\{\\sum_{t=0}^{\\infty}\\beta^t u\\Big(C_t,N_t,\\dfrac{M_t}{P_t}\\Big)\\Big\\}' },
          { label: 'Бюджетное ограничение', tex: '\\int_0^1 P_{it}C_{it}\\,di+M_t+Q_tB_t\\le M_{t-1}+B_{t-1}+W_tN_t+D_t' },
          { label: 'Полезность', tex: 'u=\\dfrac{C_t^{1-\\sigma}-1}{1-\\sigma}-\\dfrac{N_t^{1+\\varphi}}{1+\\varphi}+\\dfrac{\\left(M_t/P_t\\right)^{1-\\nu}-1}{1-\\nu}' },
          { label: 'Уравнение Эйлера (лог-лин.)', tex: 'c_t=\\mathbb E_t c_{t+1}-\\dfrac{1}{\\sigma}\\big(i_t-\\mathbb E_t\\pi_{t+1}-\\rho\\big),\\qquad \\rho=-\\ln\\beta' },
        ] },
        { title: 'Фирмы', eqs: [
          { label: 'Технология', tex: 'Y_{it}=A_tN_{it}^{1-\\alpha}' },
          { label: 'Выбор цены', tex: '\\max_{P_t^*}\\ \\sum_{k=0}^{\\infty}\\theta^k\\mathbb E_t\\Big\\{\\Lambda_{t,t+k}\\big(P_t^*Y_{i,t+k|t}-TC_{i,t+k|t}(Y_{i,t+k|t})\\big)\\Big\\}' },
          { label: 'Спрос', tex: 'Y_{i,t+k|t}=\\Big(\\dfrac{P_t^*}{P_{t+k}}\\Big)^{-\\varepsilon}C_{t+k}' },
        ] },
        { title: 'Три уравнения', eqs: [
          { label: 'Dynamic IS', tex: '\\tilde y_t=E^*_t\\tilde y_{t+1}-\\dfrac{1}{\\sigma}\\big(i_t-E^*_t\\pi_{t+1}-r^n_t\\big)' },
          { label: 'PC', tex: '\\pi_t=\\beta\\cdot E^*_t\\pi_{t+1}+\\kappa\\cdot \\tilde y_t+u_t,\\qquad \\kappa=\\lambda\\Big(\\sigma+\\dfrac{\\varphi+\\alpha}{1-\\alpha}\\Big)' },
          { label: 'MPR', tex: 'i_t=\\rho+\\phi_\\pi\\pi_t+\\phi_y\\tilde y_t+v_t' },
          { label: 'Принцип Тейлора', tex: '\\kappa(\\phi_\\pi-1)+(1-\\beta)\\phi_y>0' },
        ] },
        { title: 'Ожидания', eqs: [
          { label: 'Наивные', tex: 'E^*_t\\pi_{t+1}=0,\\qquad E^*_t\\tilde y_{t+1}=0' },
          { label: 'Адаптивные', tex: 'E^*_t\\pi_{t+1}=E^*_{t-1}\\pi_t+\\gamma\\big(\\pi_{t-1}-E^*_{t-1}\\pi_t\\big)' },
          { label: 'Рациональные', tex: 'E^*_t=\\mathbb E_t' },
        ] },
      ],
      refs: [
        'Galí J. (2015). <i>Monetary Policy, Inflation, and the Business Cycle: An Introduction to the New Keynesian Framework and Its Applications</i>. 2nd ed. Princeton: Princeton University Press.',
        'Calvo G. A. (1983). Staggered Prices in a Utility-Maximizing Framework. <i>Journal of Monetary Economics</i>, 12(3), 383–398.',
        'Taylor J. B. (1993). Discretion versus Policy Rules in Practice. <i>Carnegie-Rochester Conference Series on Public Policy</i>, 39, 195–214.',
        'Clarida R., Galí J., Gertler M. (1999). The Science of Monetary Policy: A New Keynesian Perspective. <i>Journal of Economic Literature</i>, 37(4), 1661–1707.',
        'Molnár K., Santoro S. (2014). Optimal Monetary Policy When Agents Are Learning. <i>European Economic Review</i>, 66, 39–62.',
      ],
    },
  },
  {
    id: 'qpm',
    title: 'Квартальная прогнозная модель',
    subtitle: 'Quarterly Projection Model (QPM)',
    blurb: 'Полуструктурная модель разрывов малой открытой экономики: выпуск, инфляция, валютный курс и ключевая ставка в квартальной частоте.',
    tags: ['Прогнозирование', 'Монетарная политика'],
    glyph: 'fan',
    planned: [
      ['Время', 'дискретное (кварталы)'],
      ['Вариации', 'закрытая / малая открытая экономика'],
      ['Шоки', 'спроса, предложения, валютного курса, денежно-кредитной политики; с персистентностью'],
      ['Параметры', 'инерция выпуска и инфляции, вес ожиданий, реакция ЦБ, сглаживание ставки'],
    ],
  },
];

// Маленькие иллюстрации для плиток (условные кривые, не данные)
export const GLYPHS = {
  concave: 'M6 58 C 18 18, 50 14, 94 16 M6 58 L 76 6',
  // фазовая диаграмма Рамсея: асимметричный горб k̇ = 0, смещённый вправо, и вертикаль ċ = 0
  saddle: 'M6 58 C 32 8, 84 0, 94 58 M32 4 V58',
  cycle: 'M6 34 C 16 14, 26 14, 36 34 S 56 54, 66 34 S 86 14, 94 26',
  damped: 'M6 10 C 18 60, 30 52, 40 26 S 58 22, 66 34 S 84 36, 94 32',
  steps: 'M6 54 H 24 V 42 H 42 V 32 H 60 V 24 H 78 V 18 H 94',
  // выпуклая кривая безразличия касается вогнутой границы возможностей в одной точке
  budget: 'M6 12 C 43.6 12, 74 32.6, 74 58 M45.4 3.5 C 49.9 17.5, 53.4 23.2, 62.4 32.2 C 72.4 42.2, 80 42.7, 94 45.2',
  fan: 'M6 40 C 18 30, 30 46, 46 34 M46 34 L 94 12 M46 34 L 94 34 M46 34 L 94 54',
};
