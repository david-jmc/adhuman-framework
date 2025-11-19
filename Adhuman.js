const Knowledge_Base = (function() {
    const KEY_HISTORY = 'userZoomHistory';
    const MAX_HISTORY_SIZE = 5; 
    const WEIGHT_FACTOR_RECENT = 0.6; 

    let PlannerReference = null; 

    const state = {
        THRESHOLD_LEITURA: 0.2, 
        ZOOM_BASE: 1.3,
        TRANSITION: 'all 0.5s ease-in-out',
        LINE_HEIGHT: '1.8',
        INACTIVITY_TIMEOUT_MS: 30000, 
        lastActivityTime: Date.now(),
        preferenceHistory: [1.0], 
        customMultiplier: 1.0,
    };

    function calculateWeightedMultiplier() {
        const history = state.preferenceHistory;
        if (history.length === 0) return 1.0; 
        if (history.length === 1) return history[0]; 
        
        const latestMultiplier = history[history.length - 1];
        const historicSum = history
                            .slice(0, -1)
                            .reduce((a, b) => a + b, 0);
                            
        const historicAverage = historicSum / (history.length - 1);
        
        const weightHistoric = 1.0 - WEIGHT_FACTOR_RECENT;
        const weightedMultiplier = (historicAverage * weightHistoric) + (latestMultiplier * WEIGHT_FACTOR_RECENT);
        
        return Math.max(0.8, Math.min(1.5, weightedMultiplier));
    }

    function loadPreferences() {
        const storedHistory = localStorage.getItem(KEY_HISTORY);
        state.preferenceHistory = storedHistory ? JSON.parse(storedHistory) : [1.0]; 
        state.customMultiplier = calculateWeightedMultiplier();
    }

    function savePreference(newMultiplier) {
        const validatedMultiplier = Math.max(0.8, Math.min(1.5, newMultiplier));
        
        state.preferenceHistory.push(validatedMultiplier);
        if (state.preferenceHistory.length > MAX_HISTORY_SIZE) {
            state.preferenceHistory.shift(); 
        }
        
        localStorage.setItem(KEY_HISTORY, JSON.stringify(state.preferenceHistory));
        
        state.customMultiplier = calculateWeightedMultiplier();
        
        if (PlannerReference && PlannerReference.forcarReexecucao) {
             PlannerReference.forcarReexecucao();
        }
    }
    
    function adaptForInactivity() {
        const currentState = state.preferenceHistory[state.preferenceHistory.length - 1];
        const newMultiplier = currentState + 0.05; 
        savePreference(newMultiplier); 
    }

    loadPreferences();

    return {
        getState: () => state,
        getFinalZoomSize: () => `${(state.ZOOM_BASE * state.customMultiplier).toFixed(2)}em`,
        setPlannerReference: (planner) => { PlannerReference = planner; },
        AumentarPreferencia: () => savePreference(state.preferenceHistory[state.preferenceHistory.length - 1] + 0.1),
        DiminuirPreferencia: () => savePreference(state.preferenceHistory[state.preferenceHistory.length - 1] - 0.1),
        adaptForInactivity: adaptForInactivity 
    };
})();

const Executor_GUI = (function(Knowledge) {
    
    function adicionarInterfaceFeedback(elemento) {
        const ui = elemento.querySelector('.mapek-feedback-ui') || document.createElement('div');
        if (!ui.classList.contains('mapek-feedback-ui')) {
            ui.className = 'mapek-feedback-ui';
            ui.style.cssText = `
                all: unset; position: absolute; top: 0; right: 0; z-index: 99999;
                display: flex; gap: 5px; background: rgba(0, 0, 0, 0.7); 
                padding: 5px; border-radius: 0 0 0 5px; font-family: Arial, sans-serif; font-size: 12px;
            `; 
            
            const btnStyle = 'all: unset; background: none; border: 1px solid white; color: white; cursor: pointer; padding: 2px 5px; border-radius: 3px; text-align: center;';

            const btnPlus = document.createElement('button');
            btnPlus.textContent = '+';
            btnPlus.style.cssText = btnStyle;
            btnPlus.onclick = Knowledge.AumentarPreferencia; 
            
            const btnMinus = document.createElement('button');
            btnMinus.textContent = '-';
            btnMinus.style.cssText = btnStyle;
            btnMinus.onclick = Knowledge.DiminuirPreferencia; 

            ui.appendChild(btnMinus);
            ui.appendChild(btnPlus);
            
            elemento.style.position = 'relative';
            elemento.appendChild(ui);
        }
    }
    
    function removerInterfaceFeedback(elemento) {
        const ui = elemento.querySelector('.mapek-feedback-ui');
        if (ui) {
            elemento.removeChild(ui);
            if (elemento.style.position === 'relative') {
                elemento.style.position = ''; 
            }
        }
    }
    
    function executarZoom(plano) {
        if (!plano.elemento) return;
        
        const estado = Knowledge.getState();
        const elemento = plano.elemento;
        elemento.style.transition = estado.TRANSITION; 

        if (plano.acoes.includes('APLICAR_ZOOM')) {
            elemento.style.fontSize = Knowledge.getFinalZoomSize(); 
            elemento.style.lineHeight = estado.LINE_HEIGHT;
            elemento.classList.add('mapek-hightlight');
            adicionarInterfaceFeedback(elemento); 
        } else if (plano.acoes.includes('REVERTER_ZOOM')) {
            elemento.style.fontSize = ''; 
            elemento.style.lineHeight = '';
            elemento.classList.remove('mapek-hightlight');
            removerInterfaceFeedback(elemento); 
            elemento.style.filter = ''; 
            document.body.style.filter = ''; 
        }
        
        if (plano.acoes.includes('APLICAR_ALTO_CONTRASTE')) {
            document.body.style.filter = 'invert(1) hue-rotate(180deg)'; 
            elemento.style.filter = 'invert(1) hue-rotate(180deg)'; 
        }
        
        if (plano.acoes.includes('SOLICITAR_VALIDACAO_HIL')) {
            
        }
    }

    return {
        executarZoom: executarZoom
    };

})(Knowledge_Base);

const Stage_Classifier = (function(Knowledge) {
    
    function classifySituation() {
        const { customMultiplier, THRESHOLD_LEITURA } = Knowledge.getState();
        const deviation = Math.abs(customMultiplier - 1.0);

        if (deviation <= THRESHOLD_LEITURA) {
            return 'SIMPLES';
        } else {
            return 'COMPLEXA';
        }
    }

    return {
        classifySituation: classifySituation
    };

})(Knowledge_Base);

const Decision_Support = (function(Analyze, Execute) {
    
    function gerarPlanoDeAdaptacao(entry) {
        const classificacao = Analyze.classifySituation(); 
        const state = Knowledge_Base.getState(); 
        
        if (entry.isIntersecting && entry.intersectionRatio >= state.THRESHOLD_LEITURA) {
            
            let acoes = ['APLICAR_ZOOM'];

            if (classificacao === 'COMPLEXA') {
                if (state.customMultiplier > 1.3) { 
                    acoes.push('APLICAR_ALTO_CONTRASTE'); 
                } else {
                    acoes.push('SOLICITAR_VALIDACAO_HIL');
                }
            }
            
            return { acoes: acoes, elemento: entry.target };
            
        } else if (entry.intersectionRatio < state.THRESHOLD_LEITURA) {
            return { acoes: ['REVERTER_ZOOM'], elemento: entry.target };
        }
        
        return { acoes: [] }; 
    }
    
    function forcarReexecucao() {
        document.querySelectorAll('.mapek-hightlight').forEach(el => {
            const plano = gerarPlanoDeAdaptacao({
                isIntersecting: true, 
                intersectionRatio: 1.0, 
                target: el
            });
            Execute.executarZoom(plano);
        });
    }

    return {
        gerarPlanoDeAdaptacao: gerarPlanoDeAdaptacao,
        forcarReexecucao: forcarReexecucao
    };

})(Stage_Classifier, Executor_GUI);

Knowledge_Base.setPlannerReference(Decision_Support);

const Context_Collector = (function(Knowledge, Planner, Execute) {
    
    const state = Knowledge.getState();
    let inactivityTimer = null;

    function resetActivityTimer() {
        state.lastActivityTime = Date.now();
        clearTimeout(inactivityTimer); 
        inactivityTimer = setTimeout(analisarInatividade, state.INACTIVITY_TIMEOUT_MS);
    }
    
    function setupGlobalActivityListeners() {
        document.addEventListener('mousemove', resetActivityTimer);
        document.addEventListener('keydown', resetActivityTimer);
        document.addEventListener('scroll', resetActivityTimer);
        resetActivityTimer(); 
    }

    function iniciarMonitoramentoZoom() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: state.THRESHOLD_LEITURA 
        };

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                const plano = Planner.gerarPlanoDeAdaptacao(entry);
                if (plano.acoes.length > 0) {
                    Execute.executarZoom(plano);
                }
            });
        };

        const zoomObserver = new IntersectionObserver(observerCallback, options);
        document.querySelectorAll('p').forEach(p => { 
            zoomObserver.observe(p);
        });
    }
    
    function analisarInatividade() {
        const timeElapsed = Date.now() - state.lastActivityTime;
        if (timeElapsed >= state.INACTIVITY_TIMEOUT_MS) {
            const elementoEmFoco = document.querySelector('.mapek-hightlight');
            if (elementoEmFoco) {
                Knowledge.adaptForInactivity();
            }
        }
    }

    return {
        iniciar: () => {
            iniciarMonitoramentoZoom();
            setupGlobalActivityListeners();
        }
    };

})(Knowledge_Base, Decision_Support, Executor_GUI);

const ADHUMAN_Core = (function(Collector) {
    
    function start() {
        Collector.iniciar();
    }

    return {
        start: start
    };
    
})(Context_Collector);

(function() {
    ADHUMAN_Core.start();
})();