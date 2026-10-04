# Независимый решатель (scipy, своя постановка в эффективных единицах, как в презентации)
import json, numpy as np
from scipy.optimize import root
a,b,d,sig,g = .3,.96,.1,2.,.02
phi, t0, th, rhoS = .10, 5, 15, .8
T = 400
Z = np.array([1+(phi*rhoS**(t-th) if t>=th else 0) for t in range(T+2)])
E = np.array([(1+g)**t for t in range(T+2)])*Z          # E_t = (1+g)^t (1+φ ρ^{t-t̂} 1{t≥t̂})
r_ss = (1+g)**sig/b-1
kt_ss = (a/(r_ss+d))**(1/(1-a)); ct_ss = kt_ss**a-(d+g)*kt_ss
# до t0 — стационар; с t0 агенты знают весь путь E_t. Неизвестные: c̃_t, k̃_{t+1}, t=t0..T-1; k̃_T = k̃*
n = T-t0
def F(x):
    c = x[:n]; k = np.concatenate([[kt_ss], x[n:], [kt_ss]])   # k̃_{t0}..k̃_T
    res=[]
    for i in range(n):
        t=t0+i
        # ресурсное ограничение в эффективных единицах: (E_{t+1}/E_t) k̃_{t+1} = (1-δ)k̃_t + k̃_t^α - c̃_t
        res.append(E[t+1]/E[t]*k[i+1]-((1-d)*k[i]+k[i]**a-c[i]))
    for i in range(n-1):
        t=t0+i
        # Эйлер в уровнях: (c_{t+1}/c_t)^σ = β(α k̃_{t+1}^{α-1}+1-δ), c_t = c̃_t E_t
        res.append((c[i+1]*E[t+1]/(c[i]*E[t]))**sig - b*(a*k[i+1]**(a-1)+1-d))
    return np.array(res)
x0 = np.concatenate([np.full(n,ct_ss), np.full(n-1,kt_ss)])
sol = root(F, x0, method='hybr', options={'xtol':1e-13})
c = np.concatenate([np.full(t0,ct_ss), sol.x[:n]]); k = np.concatenate([np.full(t0+1,kt_ss), sol.x[n:]])
c_lvl = c*E[:len(c)]; k_lvl = k*E[:len(k)]
js = json.load(open('/tmp/claude-0/verify/js_path.json'))
H=61
dc = np.max(np.abs(np.array(js['c'][:H])-c_lvl[:H])/c_lvl[:H])
dk = np.max(np.abs(np.array(js['k'][:H])-k_lvl[:H])/k_lvl[:H])
print('scipy converged:', sol.success, '| max rel diff c:', dc, '| k:', dk)
print('c_t (JS vs scipy) at t=4,5,14,15,16:', [ (round(js['c'][t],6), round(c_lvl[t],6)) for t in (4,5,14,15,16)])
