document.addEventListener('DOMContentLoaded', () => {
    // === CONSTANTES E VARIÁVEIS GLOBAIS ===
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwp5qYEHe2xJlVzwfVjG95X4lH7M2ND2tlkiwBaJcplwNpBlTv7rMphgQH3Qxr61w9-Lg/exec';
    const CLOUDINARY_CLOUD_NAME = 'dh8hpjwlc';
    const CLOUDINARY_UPLOAD_PRESET = 'my-carousel-preset';
    const REMOVE_BG_API_KEY = 'H1uRVGozgiKsgwkuPZyiYUi3'; // Substitua pela sua chave da API Remove.bg

    // Sistema de debounce para saveState
    let saveTimeout;
    let isLoadingFromHistory = false;

    function debouncedSaveState() {
        // Não salvar se estamos carregando do histórico
        if (isLoadingFromHistory) return;

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (!isLoadingFromHistory) {
                saveState();
            }
        }, 1000); // 1 segundo de espera
    }

    let galleryImages = [];
    let currentPage = 1;
    let totalPages = 1;
    let selectedGalleryImage = null;

    // Variável para controlar o modo selecionado
    let selectedMode = 'planilha'; // 'planilha' ou 'ia'

    let allRoteiros = [];

    let themeRoteiros = [];
    let currentSlideIndex = 0;
    let activeElement = null;
    let elementCounter = 0;
    let isPanning = false;
    let persistentGuidesX = new Set();
    let persistentGuidesY = new Set();

    // Variáveis para Zoom e Pan
    let currentScale = 1;
    let slidePosX = 0;
    let slidePosY = 0;

    // --- NOVO: Variáveis para o Histórico (Undo/Redo) ---
    let history = [];
    let historyIndex = -1;

    const watermarkData = { clara: 'https://i.imgur.com/aRMubKX.png', escura: 'https://i.imgur.com/1jWGIzV.png' };
    const colors = { terracota: '#C36640', lightGray: '#F4F4F4', black: '#000000' };

    // ✅ CONSTANTES PARA SNAP MAGNÉTICO DA MARCA D'ÁGUA
    const WATERMARK_SNAP_CONFIG = {
        x: 111,
        y: 311,
        threshold: 15, // pixels de distância para ativar snap
        strength: 0.3, // força do snap (0.0 = nenhuma, 1.0 = total)
        visualFeedback: true
    };



    // === ELEMENTOS DO DOM ===
    const slideContainer = document.getElementById('slideContainer');
    const introScreen = document.getElementById('intro-screen');


    // === EVENTOS DOS BOTÕES DE MODO ===
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active de todos
            modeBtns.forEach(b => b.classList.remove('active'));
            // Adiciona active no clicado
            btn.classList.add('active');

            // Atualiza modo selecionado
            selectedMode = btn.dataset.mode;

            // Mostra/esconde conteúdo
            document.querySelectorAll('.mode-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${selectedMode}-mode`).classList.add('active');

            // Mostra botão confirmar se tiver conteúdo válido
            checkConfirmButton();
        });
    });

    function checkConfirmButton() {
        const confirmBtn = document.getElementById('confirmBtn');

        if (selectedMode === 'planilha') {
            // Modo planilha: precisa ter carrossel selecionado
            const carouselDropdown = document.getElementById('introCarouselDropdown');
            if (carouselDropdown.value) {
                confirmBtn.classList.remove('hidden');
            } else {
                confirmBtn.classList.add('hidden');
            }
        } else if (selectedMode === 'ia') {
            // Modo IA: precisa ter tema digitado
            const iaThemeInput = document.getElementById('iaThemeInput');
            if (iaThemeInput.value.trim()) {
                confirmBtn.classList.remove('hidden');
            } else {
                confirmBtn.classList.add('hidden');
            }
        }
    }



    const introThemeDropdown = document.getElementById('introThemeDropdown');
    const introCarouselDropdown = document.getElementById('introCarouselDropdown');
    const confirmBtn = document.getElementById('confirmBtn');
    const topBarsWrapper = document.querySelector('.top-bars-wrapper');
    const mainElement = document.querySelector('main');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const slideCounter = document.getElementById('slideCounter');
    const themeDropdown = document.getElementById('themeDropdown');
    const carouselDropdown = document.getElementById('carouselDropdown');
    const boldBtn = document.getElementById('boldBtn');
    const italicBtn = document.getElementById('italicBtn');
    const underlineBtn = document.getElementById('underlineBtn');
    const leftAlignBtn = document.getElementById('leftAlignBtn');
    const centerAlignBtn = document.getElementById('centerAlignBtn');
    const rightAlignBtn = document.getElementById('rightAlignBtn');
    const justifyBtn = document.getElementById('justifyBtn');
    const lineHeightSelect = document.getElementById('lineHeightSelect');
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const textColorPicker = document.getElementById('textColorPicker');
    const bringToFrontBtn = document.getElementById('bringToFrontBtn');
    const sendToBackBtn = document.getElementById('sendToBackBtn');
    const opacitySlider = document.getElementById('opacitySlider');
    const deleteBtn = document.getElementById('deleteBtn');
    const colorPicker = document.getElementById('colorPicker');
    const exportPngBtn = document.getElementById('exportPngBtn');
    const imageUpload = document.getElementById('imageUpload');
    const addSlideBtn = document.getElementById('addSlideBtn');
    const removeSlideBtn = document.getElementById('removeSlideBtn');
    const removeBgBtn = document.getElementById('removeBgBtn');
    const saveBtn = document.getElementById('saveBtn');
    const addTextBtn = document.getElementById('addTextBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');

    // --- NOVO: Elementos da Galeria ---
    const galleryModal = document.getElementById('galleryModal');
    const closeGalleryModal = document.getElementById('closeGalleryModal');
    const galleryGrid = document.getElementById('galleryGrid');
    const gallerySearchInput = document.getElementById('gallerySearchInput');
    const searchGalleryBtn = document.getElementById('searchGalleryBtn');
    const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');


    // === FUNÇÕES DE HISTÓRICO (UNDO/REDO) ===
    function saveState() {
        try {
            const elements = slideContainer.querySelectorAll('.draggable-item');
            const slideState = Array.from(elements).map(element => {
                // Versão segura do getElementState
                if (!element) return null;

                const isText = element.classList.contains('is-text');
                const isWatermark = element.classList.contains('is-watermark');
                const type = isText ? 'text' : (isWatermark ? 'watermark' : 'image');

                let content = '';
                if (isText) {
                    content = element.innerHTML;
                } else {
                    // Buscar img de forma segura
                    const imgElement = element.querySelector('img');
                    content = imgElement ? imgElement.src : (element.src || '');
                }

                return {
                    type: type,
                    id: element.id,
                    x: parseFloat(element.getAttribute('data-x')) || 0,
                    y: parseFloat(element.getAttribute('data-y')) || 0,
                    angle: parseFloat(element.getAttribute('data-angle')) || 0,
                    width: element.style.width,
                    height: element.style.height,
                    content: content,
                    style: element.style.cssText,
                    ratio: type === 'image' ? element.getAttribute('data-ratio') : null
                };
            }).filter(state => state !== null);

            // Remover estados futuros se existirem
            history.splice(historyIndex + 1);

            // Adicionar novo estado
            history.push(slideState);

            // Limitar histórico
            if (history.length > 50) {  // Limite de 50 estados no histórico
                history.shift();
            } else {
                historyIndex++;
            }

            console.log('Estado salvo com sucesso:', slideState.length, 'elementos');

        } catch (error) {
            console.error('Erro ao salvar estado:', error);
        }
    }


    function loadStateFromHistory(index) {
        try {
            // history[index] já é um array de objetos, não precisa de JSON.parse
            const slideState = Array.isArray(history[index])
                ? history[index]
                : [];

            // Limpar slide atual
            slideContainer.innerHTML = '';

            // Recriar elementos do histórico
            slideState.forEach(elementState => {
                if (!elementState) return;

                let element;
                if (elementState.type === 'text') {
                    element = document.createElement('div');
                    element.innerHTML = elementState.content;
                } else {
                    element = document.createElement('div');
                    element.className = 'draggable-item is-image';

                    const img = document.createElement('img');
                    img.src = elementState.content;
                    element.appendChild(img);

                    const handle = document.createElement('div');
                    handle.className = 'rotation-handle';
                    element.appendChild(handle);
                }

                element.id = elementState.id;
                element.className = `draggable-item ${elementState.type === 'text' ? 'is-text' : 'is-image'}`;
                element.style.cssText = elementState.style;
                element.setAttribute('data-x', elementState.x);
                element.setAttribute('data-y', elementState.y);
                element.setAttribute('data-angle', elementState.angle || 0);
                if (elementState.ratio) element.setAttribute('data-ratio', elementState.ratio);

                slideContainer.appendChild(element);
                makeInteractive(element);
            });

            console.log('Estado carregado:', slideState.length, 'elementos');

        } catch (error) {
            console.error('Erro ao carregar estado:', error);
        }
    }


    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            loadStateFromHistory(historyIndex);
            console.log('Undo executado');
        }
    }


    function loadStateFromHistory(index) {
        try {
            // ✅ DEFINIR slideState CORRETAMENTE
            const slideState = Array.isArray(history[index])
                ? history[index]
                : [];

            // Limpar slide atual
            slideContainer.innerHTML = '';

            // Recriar elementos do histórico
            slideState.forEach(elementState => {
                if (!elementState) return;

                let element;
                if (elementState.type === 'text') {
                    element = document.createElement('div');
                    element.innerHTML = elementState.content;
                    element.className = 'draggable-item is-text';
                } else {
                    // Para imagens
                    element = document.createElement('div');
                    element.className = 'draggable-item is-image';

                    const img = document.createElement('img');
                    img.src = elementState.content;
                    element.appendChild(img);

                    const handle = document.createElement('div');
                    handle.className = 'rotation-handle';
                    element.appendChild(handle);
                }

                element.id = elementState.id;
                element.style.cssText = elementState.style;
                element.setAttribute('data-x', elementState.x);
                element.setAttribute('data-y', elementState.y);
                element.setAttribute('data-angle', elementState.angle || 0);
                if (elementState.ratio) element.setAttribute('data-ratio', elementState.ratio);

                slideContainer.appendChild(element);
                makeInteractive(element);
            });

            console.log('Estado carregado:', slideState.length, 'elementos');

        } catch (error) {
            console.error('Erro ao carregar estado:', error);
        }
    }




    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            loadStateFromHistory(historyIndex);
        }
    }

    // === FUNÇÕES DE COPIAR/COLAR UNIFICADO ===
    function getElementState(element) {
        if (!element) return null;
        const isText = element.classList.contains('is-text');
        const type = isText ? 'text' : (element.classList.contains('is-watermark') ? 'watermark' : 'image');
        const state = {
            type: type,
            id: element.id,
            x: parseFloat(element.getAttribute('data-x')) || 0,
            y: parseFloat(element.getAttribute('data-y')) || 0,
            angle: parseFloat(element.getAttribute('data-angle')) || 0,
            width: element.style.width,
            height: element.style.height,
            content: isText ? element.innerHTML : (element.querySelector('img') ? element.querySelector('img').src : ''),
            style: element.style.cssText
        };
        if (type === 'image') state.ratio = element.getAttribute('data-ratio');
        return state;
    }

    function createElementFromState(state) {
        let el;
        if (state.type === 'text') {
            el = document.createElement('div');
            el.innerHTML = state.content;
            el.setAttribute('contenteditable', 'true');
        } else {
            el = document.createElement('div');
            const img = document.createElement('img');
            img.src = state.content;
            el.appendChild(img);
            if (state.type === 'image') {
                const handle = document.createElement('div');
                handle.className = 'rotation-handle';
                el.appendChild(handle);
            }
        }
        el.id = state.id || `element-${elementCounter++}`;
        el.className = `draggable-item ${state.type === 'text' ? 'is-text' : (state.type === 'watermark' ? 'is-watermark' : 'is-image')}`;
        el.style.cssText = state.style;
        el.style.transform = `translate(${state.x}px, ${state.y}px) rotate(${state.angle}deg)`;
        el.setAttribute('data-x', state.x);
        el.setAttribute('data-y', state.y);
        el.setAttribute('data-angle', state.angle);
        if (state.type === 'image' && state.ratio) el.setAttribute('data-ratio', state.ratio);
        slideContainer.appendChild(el);
        makeInteractive(el);
        return el;
    }

    // --- INÍCIO DAS MODIFICAÇÕES NO CLIPBOARD ---

    /**
     * CENÁRIOS 3, 4 (parte de cópia) e 5 (cópia)
     * Gerencia o que acontece quando o usuário pressiona Ctrl+C.
     * Distingue entre copiar uma seleção de texto e copiar um elemento inteiro.
     */
    async function handleCopy(event) {
        const selection = window.getSelection();
        const isTextSelected = selection && selection.toString().trim().length > 0;

        // Se há texto selecionado dentro de um elemento editável, permite a cópia padrão do navegador.
        if (isTextSelected) {
            // Deixa o navegador copiar o texto selecionado para o clipboard do sistema.
            return;
        }

        // Se não há texto selecionado, mas um elemento está ativo (cenário 5).
        if (activeElement) {
            event.preventDefault(); // Impede a ação padrão para copiar o elemento inteiro.
            const state = getElementState(activeElement);
            if (state) {
                // Salva o estado do elemento em um clipboard interno (sessionStorage).
                const clipboardData = { type: 'MyEditorClipboardData', data: state };
                sessionStorage.setItem('myEditorClipboard', JSON.stringify(clipboardData));
            }
        }
    }

    /**
     * CENÁRIOS 1, 2, 3, 4 e 5 (parte de colar)
     * Gerencia o que acontece quando o usuário pressiona Ctrl+V.
     * Distingue entre colar texto dentro de um elemento ou criar um novo elemento.
     */
    async function handlePasteFromEvent(event) {
        // CENÁRIO: Colar DENTRO de um bloco de texto existente.
        if (document.activeElement && document.activeElement.isContentEditable) {
            // Impede a ação padrão do navegador para controlar a colagem.
            event.preventDefault();
            // Pega o conteúdo do clipboard como TEXTO PURO.
            const text = (event.clipboardData || window.clipboardData).getData('text/plain');
            // Insere o texto puro na posição do cursor, sem trazer nenhum estilo junto.
            if (text) {
                document.execCommand('insertText', false, text);
            }
            return; // Encerra a função aqui, pois o caso já foi tratado.
        }

        // Se o código chegou até aqui, a colagem não é dentro de uma caixa de texto.
        // Impede a ação padrão para poder criar um novo elemento (imagem ou texto).
        event.preventDefault();

        // Tenta colar o elemento inteiro do nosso clipboard interno primeiro (CENÁRIO 5).
        const internalClipboardData = sessionStorage.getItem('myEditorClipboard');
        if (internalClipboardData) {
            try {
                const clipboardContent = JSON.parse(internalClipboardData);
                if (clipboardContent && clipboardContent.type === 'MyEditorClipboardData') {
                    const state = clipboardContent.data;
                    state.id = `element-${elementCounter++}`; // Novo ID
                    state.x += 20; // Desloca para não sobrepor
                    state.y += 20;

                    // Remove a propriedade de cor de fundo para o caso de colar o elemento inteiro.
                    if (state.style) {
                        state.style = state.style.replace(/background-color:\s*[^;]+;?\s*/, '');
                    }

                    const newElement = createElementFromState(state);
                    setActiveElement({ currentTarget: newElement });
                    saveState();
                    sessionStorage.removeItem('myEditorClipboard'); // Limpa após o uso
                    return;
                }
            } catch (e) {
                console.error("Falha ao colar do clipboard interno.", e);
            }
        }

        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        // Lógica para colar IMAGENS (funcionalidade mantida)
        const items = clipboardData.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        await pasteImage(file);
                        return;
                    }
                }
            }
        }

        // CENÁRIO: Colar texto do clipboard do sistema para criar um NOVO bloco de texto.
        const text = clipboardData.getData('text/plain');
        if (text && text.trim().length > 0) {
            pasteText(text);
        }
    }

    // --- FIM DAS MODIFICAÇÕES NO CLIPBOARD ---


    async function pasteImage(file) {
        const cloudinaryUrl = await uploadImageSmartDuplicate(file);
        if (!cloudinaryUrl) return;

        const tempImg = new Image();
        tempImg.onload = () => {
            const ratio = tempImg.naturalWidth / tempImg.naturalHeight;
            const initialWidth = 150;
            const imgContainer = document.createElement('div');
            imgContainer.id = `element-${elementCounter++}`;
            imgContainer.className = 'draggable-item is-image';

            const img = document.createElement('img');
            img.src = cloudinaryUrl;
            imgContainer.appendChild(img);

            const handle = document.createElement('div');
            handle.className = 'rotation-handle';
            imgContainer.appendChild(handle);

            imgContainer.style.width = initialWidth + 'px';
            imgContainer.style.height = (initialWidth / ratio) + 'px';
            imgContainer.setAttribute('data-ratio', ratio);
            imgContainer.setAttribute('data-x', '50');
            imgContainer.setAttribute('data-y', '50');
            imgContainer.style.transform = 'translate(50px, 50px)';

            slideContainer.appendChild(imgContainer);
            makeInteractive(imgContainer);
            setActiveElement({ currentTarget: imgContainer });
            saveState();
        };
        tempImg.src = cloudinaryUrl;
    }

    function pasteText(text) {
        const newText = document.createElement('div');
        newText.id = `element-${elementCounter++}`;
        newText.className = 'draggable-item is-text';
        newText.setAttribute('contenteditable', 'true');
        newText.innerHTML = text.replace(/\n/g, '<br>');
        newText.style.width = '280px';
        newText.style.height = 'auto';
        newText.style.fontFamily = 'Aguila';
        newText.style.fontSize = '16px';

        const posX = 20, posY = 50;
        newText.setAttribute('data-x', posX);
        newText.setAttribute('data-y', posY);
        newText.style.transform = `translate(${posX}px, ${posY}px)`;

        slideContainer.appendChild(newText);
        makeInteractive(newText);
        setActiveElement({ currentTarget: newText });
        saveState();
    }

    // === FUNÇÕES AUXILIARES ===
    function updateSlideTransform() {
        slideContainer.style.transform = `translate(${slidePosX}px, ${slidePosY}px) scale(${currentScale})`;
    }

    function rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return rgb;
        let sep = rgb.indexOf(",") > -1 ? "," : " ";
        rgb = rgb.substr(4).split(")")[0].split(sep);
        let r = (+rgb[0]).toString(16).padStart(2, '0');
        let g = (+rgb[1]).toString(16).padStart(2, '0');
        let b = (+rgb[2]).toString(16).padStart(2, '0');
        return "#" + r + g + b;
    }


    function isColorDark(rgbColor) {
        if (!rgbColor) return false;
        if (rgbColor.startsWith('#')) {
            let r = 0, g = 0, b = 0;
            if (rgbColor.length == 4) { r = "0x" + rgbColor[1] + rgbColor[1]; g = "0x" + rgbColor[2] + rgbColor[2]; b = "0x" + rgbColor[3] + rgbColor[3]; }
            else if (rgbColor.length == 7) { r = "0x" + rgbColor[1] + rgbColor[2]; g = "0x" + rgbColor[3] + rgbColor[4]; b = "0x" + rgbColor[5] + rgbColor[6]; }
            return (0.2126 * +r + 0.7152 * +g + 0.0722 * +b) < 140;
        }
        const sep = rgbColor.indexOf(",") > -1 ? "," : " ";
        const rgb = rgbColor.substr(4).split(")")[0].split(sep);
        let r = parseInt(rgb[0], 10), g = parseInt(rgb[1], 10), b = parseInt(rgb[2], 10);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
    }

    // ✅ FUNÇÃO DE SNAP MAGNÉTICO PARA MARCA D'ÁGUA
    function applyWatermarkMagneticSnap(element, currentX, currentY) {
        if (!element.classList.contains('is-watermark')) {
            return { x: currentX, y: currentY, isSnapped: false };
        }

        const dx = currentX - WATERMARK_SNAP_CONFIG.x;
        const dy = currentY - WATERMARK_SNAP_CONFIG.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= WATERMARK_SNAP_CONFIG.threshold) {
            const snapFactor = (WATERMARK_SNAP_CONFIG.threshold - distance) /
                WATERMARK_SNAP_CONFIG.threshold *
                WATERMARK_SNAP_CONFIG.strength;

            const snappedX = currentX - dx * snapFactor;
            const snappedY = currentY - dy * snapFactor;

            if (WATERMARK_SNAP_CONFIG.visualFeedback) {
                element.style.boxShadow = `0 0 ${10 * snapFactor}px rgba(195, 102, 64, ${0.3 + snapFactor * 0.4})`;
            }

            return { x: snappedX, y: snappedY, isSnapped: true, snapStrength: snapFactor };
        } else {
            if (WATERMARK_SNAP_CONFIG.visualFeedback) {
                element.style.boxShadow = '';
            }
            return { x: currentX, y: currentY, isSnapped: false, snapStrength: 0 };
        }
    }



    // SUBSTITUA A FUNÇÃO dragMoveListener PELA VERSÃO ABAIXO
    function dragMoveListener(event) {
        if (isPanning) {
            slidePosX += event.dx;
            slidePosY += event.dy;
            updateSlideTransform();
            return;
        }

        const target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        const angle = parseFloat(target.getAttribute('data-angle')) || 0;


        // ✅ VERIFICAR SE É MARCA D'ÁGUA
        const isWatermark = target.classList.contains('is-watermark');

        if (isWatermark) {
            // ✅ MARCA D'ÁGUA: APENAS SNAP ESPECÍFICO 111,311
            const snapResult = applyWatermarkMagneticSnap(target, x, y);
            x = snapResult.x;
            y = snapResult.y;
        }

        document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));

        const vImageGuide = document.getElementById('image-guide-v');
        const hImageGuide = document.getElementById('image-guide-h');
        if (vImageGuide) vImageGuide.classList.remove('visible');
        if (hImageGuide) hImageGuide.classList.remove('visible');

        if (target.classList.contains('is-watermark')) {
            const snapThreshold = 0.5;
            const containerWidth = slideContainer.offsetWidth;
            const elementWidth = target.offsetWidth;
            const elementCenterX = x + (elementWidth / 2);
            const containerCenterX = containerWidth / 2;

            if (Math.abs(elementCenterX - containerCenterX) < snapThreshold) {
                x = containerCenterX - (elementWidth / 2);
                document.getElementById('snap-v-50').classList.add('visible');
            }
        }

        if (target.classList.contains('is-image') && !isWatermark) {
            // Aplicar snap inteligente primeiro
            if (persistentGuidesX.size > 0 || persistentGuidesY.size > 0) {

                const snapped = applySmartSnapping(target, x, y);
                x = snapped.x;
                y = snapped.y;
            }

            // Magnetismo para guias de 5% (vermelhas) - RESTO DO CÓDIGO IGUAL
            if (vImageGuide && hImageGuide) {
                const visualSnapThreshold = 2;
                const unscaledWidth = target.offsetWidth / currentScale;
                const unscaledHeight = target.offsetHeight / currentScale;
                const elementCenterX = x + unscaledWidth / 2;
                const elementCenterY = y + unscaledHeight / 2;
                const containerWidth = slideContainer.offsetWidth;
                const containerHeight = slideContainer.offsetHeight;

                for (let i = 5; i < 100; i += 5) {
                    const snapLineX = containerWidth * (i / 100);
                    if (Math.abs(elementCenterX - snapLineX) < visualSnapThreshold) {
                        x = snapLineX - (unscaledWidth / 2);
                        vImageGuide.style.left = `${i}%`;
                        vImageGuide.classList.add('visible');
                        break;
                    }
                }

                for (let i = 5; i < 100; i += 5) {
                    const snapLineY = containerHeight * (i / 100);
                    if (Math.abs(elementCenterY - snapLineY) < visualSnapThreshold) {
                        y = snapLineY - (unscaledHeight / 2);
                        hImageGuide.style.top = `${i}%`;
                        hImageGuide.classList.add('visible');
                        break;
                    }
                }
            }
        }



        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    function dragEndListener() {
        document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));
        saveState();
    }

    function resizeListener(event) {
        const target = event.target;
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.deltaRect.left;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.deltaRect.top;
        const ratio = parseFloat(target.getAttribute('data-ratio'));
        const angle = parseFloat(target.getAttribute('data-angle')) || 0;
        let newWidth = event.rect.width;
        let newHeight = event.rect.height;
        if (ratio) newHeight = newWidth / ratio;
        target.style.width = newWidth + 'px';
        target.style.height = newHeight + 'px';
        target.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    // --- FUNÇÃO makeInteractive CORRIGIDA COM HANDLE DE MOVIMENTO ---
    function makeInteractive(target) {
        if (target.classList.contains('is-text')) {
            let moveHandle = target.querySelector('.move-handle');
            if (!moveHandle) {
                moveHandle = document.createElement('div');
                moveHandle.className = 'move-handle';
                target.appendChild(moveHandle);
            }

            interact(moveHandle).draggable({
                listeners: {
                    start: function (event) {
                        const targetElement = event.target.parentElement;
                        if (targetElement && targetElement.classList) {
                            collectAndShowPersistentGuides(targetElement, 'text');
                        }
                    },
                    move(event) {
                        const targetElement = event.target.parentElement;
                        // VERIFICAÇÃO ESSENCIAL - PARAR SE ELEMENTO INVÁLIDO
                        if (!targetElement || !targetElement.classList || !targetElement.getAttribute) {
                            return;
                        }

                        let x = (parseFloat(targetElement.getAttribute('data-x')) || 0) + event.dx;
                        let y = (parseFloat(targetElement.getAttribute('data-y')) || 0) + event.dy;
                        const angle = parseFloat(targetElement.getAttribute('data-angle')) || 0;

                        // ✅ VERIFICAR SE É MARCA D'ÁGUA
                        const isWatermark = targetElement.classList.contains('is-watermark');

                        if (isWatermark) {
                            // ✅ MARCA D'ÁGUA: APENAS SNAP ESPECÍFICO 111,311
                            const snapResult = applyWatermarkMagneticSnap(targetElement, x, y);
                            x = snapResult.x;
                            y = snapResult.y;
                        } else {
                            // ✅ OUTROS ELEMENTOS: SNAP INTELIGENTE NORMAL
                            // Aplicar snap inteligente se houver guias ativas
                            if (persistentGuidesX.size > 0 || persistentGuidesY.size > 0) {
                                const snapped = applySmartSnapping(targetElement, x, y);
                                x = snapped.x;
                                y = snapped.y;
                            }

                            // ... RESTO DO CÓDIGO IGUAL (snap das linhas 25%, 50%, 75%)
                            const snapThreshold = 0.5;
                            const unscaledWidth = targetElement.offsetWidth / currentScale;
                            const unscaledHeight = targetElement.offsetHeight / currentScale;
                            const elementCenterX = x + (unscaledWidth / 2);
                            const elementCenterY = y + (unscaledHeight / 2);

                            document.querySelectorAll('.snap-line-v, .snap-line-h').forEach(l => l.classList.remove('visible'));

                            const snapPoints = [0.25, 0.50, 0.75];
                            const containerWidth = slideContainer.offsetWidth;
                            const containerHeight = slideContainer.offsetHeight;

                            for (const point of snapPoints) {
                                const snapLineX = containerWidth * point;
                                if (Math.abs(elementCenterX - snapLineX) < snapThreshold) {
                                    x = snapLineX - (unscaledWidth / 2);
                                    const snapElement = document.getElementById(`snap-v-${Math.round(point * 100)}`);
                                    if (snapElement) snapElement.classList.add('visible');
                                    break;
                                }
                            }

                            for (const point of snapPoints) {
                                const snapLineY = containerHeight * point;
                                if (Math.abs(elementCenterY - snapLineY) < snapThreshold) {
                                    y = snapLineY - (unscaledHeight / 2);
                                    const snapElement = document.getElementById(`snap-h-${Math.round(point * 100)}`);
                                    if (snapElement) snapElement.classList.add('visible');
                                    break;
                                }
                            }
                        }

                        targetElement.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
                        targetElement.setAttribute('data-x', x);
                        targetElement.setAttribute('data-y', y);
                    },

                    end: function () {
                        removePersistentGuides();
                        dragEndListener();
                    }
                }
            });
            interact(target).resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                listeners: { move: resizeListener, end: saveState },
                modifiers: [interact.modifiers.restrictSize({ min: { width: 50 } })]
            }).draggable(false).on('tap', setActiveElement);
            target.addEventListener('blur', saveState);

        } else {
            interact(target)
                .draggable({
                    listeners: {
                        start: function (event) {
                            if (event.target && event.target.classList && event.target.classList.contains('is-image')) {
                                const vGuide = document.createElement('div');
                                vGuide.id = 'image-guide-v';
                                slideContainer.appendChild(vGuide);
                                const hGuide = document.createElement('div');
                                hGuide.id = 'image-guide-h';
                                slideContainer.appendChild(hGuide);
                                collectAndShowPersistentGuides(event.target, 'image');
                            }
                        },
                        move: dragMoveListener,
                        end: function () {
                            const vGuide = document.getElementById('image-guide-v');
                            if (vGuide) vGuide.remove();
                            const hGuide = document.getElementById('image-guide-h');
                            if (hGuide) hGuide.remove();
                            removePersistentGuides();
                            dragEndListener();
                        }
                    },
                    inertia: true
                })
                .resizable({
                    edges: { left: true, right: true, bottom: true, top: true },
                    listeners: { move: resizeListener, end: saveState },
                    modifiers: [interact.modifiers.restrictSize({ min: { width: 50 } })]
                })
                .on('tap', setActiveElement);
        }

        const rotationHandle = target.querySelector('.rotation-handle');
        if (rotationHandle) {
            interact(rotationHandle).draggable({
                onstart: function () {
                    if (!target || !target.getBoundingClientRect) return;
                    const rect = target.getBoundingClientRect();
                    const slideRect = slideContainer.getBoundingClientRect();
                    target.setAttribute('data-center-x', (rect.left - slideRect.left) + rect.width / 2);
                    target.setAttribute('data-center-y', (rect.top - slideRect.top) + rect.height / 2);
                },
                onmove: function (event) {
                    if (!target || !target.getAttribute) return;
                    const centerX = parseFloat(target.getAttribute('data-center-x'));
                    const centerY = parseFloat(target.getAttribute('data-center-y'));
                    const slideRect = slideContainer.getBoundingClientRect();
                    const clientX = event.clientX - slideRect.left;
                    const clientY = event.clientY - slideRect.top;
                    const angle = Math.atan2(clientY - centerY, clientX - centerX);
                    const x = parseFloat(target.getAttribute('data-x')) || 0;
                    const y = parseFloat(target.getAttribute('data-y')) || 0;
                    let newAngle = angle * (180 / Math.PI) + 90;
                    const rotationSnapThreshold = 5;
                    const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -90, -135, -180, -225, -270, -315, -360];
                    rotationHandle.classList.remove('is-snapped');
                    for (const snapAngle of snapAngles) {
                        if (Math.abs(newAngle - snapAngle) < rotationSnapThreshold) {
                            newAngle = snapAngle;
                            rotationHandle.classList.add('is-snapped');
                            break;
                        }
                    }
                    target.style.transform = `translate(${x}px, ${y}px) rotate(${newAngle}deg)`;
                    target.setAttribute('data-angle', newAngle);
                },
                onend: function () {
                    if (!target || !target.removeAttribute) return;
                    target.removeAttribute('data-center-x');
                    target.removeAttribute('data-center-y');
                    rotationHandle.classList.remove('is-snapped');
                    saveState();
                }
            });
        }
    }

    function setActiveElement(event) {
        if (activeElement === event.currentTarget) return;

        if (activeElement) {
            activeElement.classList.remove('selected');
        }

        activeElement = event.currentTarget;
        activeElement.classList.add('selected');

        const allElements = Array.from(slideContainer.querySelectorAll('.draggable-item'));
        const maxZIndex = allElements.reduce((max, el) => {
            const zIndex = parseInt(el.style.zIndex, 10) || 0;
            return el === activeElement ? max : Math.max(max, zIndex);
        }, 0);

        activeElement.style.zIndex = maxZIndex + 1;

        updateToolbarState();
        saveState();
    }

    // === NOVAS FUNÇÕES PARA GUIAS INTELIGENTES ===
    // === FUNÇÕES MELHORADAS PARA GUIAS INTELIGENTES ===

    function collectAndShowPersistentGuides(draggedElement, typeToMatch) {
        // Limpar guias anteriores
        persistentGuidesX.clear();
        persistentGuidesY.clear();
        removePersistentGuides(); // Remover elementos DOM antigos

        console.log(`Coletando guias para tipo: ${typeToMatch}, elemento: ${draggedElement.id}`);

        let guidesFound = 0;

        // Iterar através de todos os roteiros
        allRoteiros.forEach((roteiro, roteiroIndex) => {
            if (!roteiro.slideState || !Array.isArray(roteiro.slideState)) return;

            roteiro.slideState.forEach(elementState => {
                // Verificações de validação
                if (!elementState ||
                    elementState.type !== typeToMatch ||
                    elementState.id === draggedElement.id ||
                    elementState.x === undefined ||
                    elementState.y === undefined ||
                    elementState.width === undefined ||
                    elementState.height === undefined) {
                    return;
                }

                // Calcular posições do centro do elemento
                const elementWidth = parseFloat(elementState.width.replace('px', '')) || 0;
                const elementHeight = parseFloat(elementState.height.replace('px', '')) || 0;

                const centerX = elementState.x + (elementWidth / 2);
                const centerY = elementState.y + (elementHeight / 2);

                // Adicionar tanto posição de borda quanto centro para mais opções de alinhamento
                persistentGuidesX.add(elementState.x); // Borda esquerda
                persistentGuidesX.add(centerX);        // Centro horizontal
                persistentGuidesY.add(elementState.y); // Borda superior  
                persistentGuidesY.add(centerY);        // Centro vertical

                guidesFound++;
            });
        });

        console.log(`Total de guias coletadas: ${guidesFound} elementos`);

        // Criar elementos visuais das guias verticais (X)
        persistentGuidesX.forEach(x => {
            const guide = document.createElement('div');
            guide.className = 'persistent-guide-v';
            guide.style.position = 'absolute';
            guide.style.left = `${x}px`;
            guide.style.top = '0';
            guide.style.bottom = '0';
            guide.style.width = '1px';
            guide.style.borderLeft = '1px dashed #4edd5b';
            guide.style.pointerEvents = 'none';
            guide.style.zIndex = '9999';
            guide.style.opacity = '0.8';
            slideContainer.appendChild(guide);
        });

        // Criar elementos visuais das guias horizontais (Y)  
        persistentGuidesY.forEach(y => {
            const guide = document.createElement('div');
            guide.className = 'persistent-guide-h';
            guide.style.position = 'absolute';
            guide.style.top = `${y}px`;
            guide.style.left = '0';
            guide.style.right = '0';
            guide.style.height = '1px';
            guide.style.borderTop = '1px dashed #4edd5b';
            guide.style.pointerEvents = 'none';
            guide.style.zIndex = '9999';
            guide.style.opacity = '0.8';
            slideContainer.appendChild(guide);
        });
    }

    function removePersistentGuides() {
        // Remover todos os elementos visuais das guias
        document.querySelectorAll('.persistent-guide-v, .persistent-guide-h').forEach(guide => {
            guide.remove();
        });

        // Limpar os sets (opcional, pois geralmente são limpos na próxima coleta)
        persistentGuidesX.clear();
        persistentGuidesY.clear();

        console.log('Guias inteligentes removidas');
    }

    function applySmartSnapping(element, newX, newY) {
        const snapThreshold = 1; // Threshold um pouco maior para ser mais tolerante
        let snappedX = newX;
        let snappedY = newY;

        // Obter dimensões do elemento
        const elementWidth = element.offsetWidth / currentScale;
        const elementHeight = element.offsetHeight / currentScale;
        const elementCenterX = newX + (elementWidth / 2);
        const elementCenterY = newY + (elementHeight / 2);

        // Verificar magnetismo para posições X (vertical guides)
        let bestXSnap = null;
        let bestXDistance = snapThreshold;

        persistentGuidesX.forEach(guideX => {
            // Testar magnetismo para borda esquerda
            const distanceLeft = Math.abs(newX - guideX);
            if (distanceLeft < bestXDistance) {
                bestXDistance = distanceLeft;
                bestXSnap = guideX; // Alinhar borda esquerda
            }

            // Testar magnetismo para centro
            const distanceCenter = Math.abs(elementCenterX - guideX);
            if (distanceCenter < bestXDistance) {
                bestXDistance = distanceCenter;
                bestXSnap = guideX - (elementWidth / 2); // Alinhar centro
            }
        });

        if (bestXSnap !== null) {
            snappedX = bestXSnap;
        }

        // Verificar magnetismo para posições Y (horizontal guides)
        let bestYSnap = null;
        let bestYDistance = snapThreshold;

        persistentGuidesY.forEach(guideY => {
            // Testar magnetismo para borda superior
            const distanceTop = Math.abs(newY - guideY);
            if (distanceTop < bestYDistance) {
                bestYDistance = distanceTop;
                bestYSnap = guideY; // Alinhar borda superior
            }

            // Testar magnetismo para centro
            const distanceCenter = Math.abs(elementCenterY - guideY);
            if (distanceCenter < bestYDistance) {
                bestYDistance = distanceCenter;
                bestYSnap = guideY - (elementHeight / 2); // Alinhar centro
            }
        });

        if (bestYSnap !== null) {
            snappedY = bestYSnap;
        }

        return { x: snappedX, y: snappedY };
    }

    // === RENDERIZAÇÃO E ESTADO ===
    function saveCurrentSlideContent() {
        if (currentSlideIndex < 0 || !allRoteiros[currentSlideIndex] || historyIndex < 0) return;
        try {
            // history[historyIndex] já é um array de objetos, não precisa de JSON.parse
            const state = Array.isArray(history[historyIndex])
                ? { elements: history[historyIndex] }
                : history[historyIndex];

            if (state && state.elements) {
                allRoteiros[currentSlideIndex].slideState = state.elements;
            }
            if (state && state.backgroundColor) {
                allRoteiros[currentSlideIndex].backgroundColor = state.backgroundColor;
            }

            console.log('Slide content saved successfully');
        } catch (e) {
            console.error("Error saving content from history", e);
        }
    }

    // ▼▼▼ A MUDANÇA É AQUI ▼▼▼
    function createDefaultDOMElements(roteiro, textColor, finalBgColor) {
        const firstSlideTitlePosX = 35, firstSlideTitlePosY = 80, firstSlideTitleFontSize = '20px', firstSlideTitleFontFamily = 'Cinzel';
        const titlePosX = 35, titlePosY = 40, titleFontSize = '20px', titleFontFamily = 'Aguila Bold';
        const bodyPosX = 35, bodyPosY = 120, bodyBoldFontFamily = 'Aguila Bold';
        const bodyBoldColor = isColorDark(finalBgColor) ? colors.lightGray : colors.black;

        // VALIDAÇÃO SEGURA DO TÍTULO
        if (roteiro.titulo && typeof roteiro.titulo === 'string' && roteiro.titulo.trim() !== '') {
            const titleDiv = document.createElement('div');
            titleDiv.id = `element-${++elementCounter}`;
            titleDiv.className = 'draggable-item is-text';
            titleDiv.setAttribute('contenteditable', 'true');
            titleDiv.innerHTML = roteiro.titulo;
            titleDiv.style.color = textColor;
            titleDiv.style.textAlign = 'center';
            titleDiv.style.width = '250px';

            if (currentSlideIndex === 0) {
                titleDiv.style.fontFamily = firstSlideTitleFontFamily;
                titleDiv.style.fontSize = firstSlideTitleFontSize;
                titleDiv.setAttribute('data-x', firstSlideTitlePosX);
                titleDiv.setAttribute('data-y', firstSlideTitlePosY);
                titleDiv.style.transform = `translate(${firstSlideTitlePosX}px, ${firstSlideTitlePosY}px)`;
            } else {
                titleDiv.style.fontFamily = titleFontFamily;
                titleDiv.style.fontSize = titleFontSize;
                titleDiv.setAttribute('data-x', titlePosX);
                titleDiv.setAttribute('data-y', titlePosY);
                titleDiv.style.transform = `translate(${titlePosX}px, ${titlePosY}px)`;
            }

            titleDiv.querySelectorAll('b, strong').forEach(boldEl => boldEl.style.color = textColor);
            slideContainer.appendChild(titleDiv);
            makeInteractive(titleDiv);
        }

        // VALIDAÇÃO SEGURA DO CORPO
        if (roteiro.corpo && typeof roteiro.corpo === 'string' && roteiro.corpo.trim() !== '') {
            const bodyDiv = document.createElement('div');
            bodyDiv.id = `element-${++elementCounter}`;
            bodyDiv.className = 'draggable-item is-text';
            bodyDiv.setAttribute('contenteditable', 'true');
            bodyDiv.innerHTML = roteiro.corpo;
            bodyDiv.style.fontFamily = 'Aguila';
            bodyDiv.style.fontSize = '14px';
            bodyDiv.style.color = textColor;
            bodyDiv.style.textAlign = 'justify';
            bodyDiv.style.width = '250px';
            bodyDiv.setAttribute('data-x', bodyPosX);
            bodyDiv.setAttribute('data-y', bodyPosY);
            bodyDiv.style.transform = `translate(${bodyPosX}px, ${bodyPosY}px)`;
            bodyDiv.querySelectorAll('b, strong').forEach(boldEl => {
                boldEl.style.color = bodyBoldColor;
                boldEl.style.fontFamily = bodyBoldFontFamily;
            });
            slideContainer.appendChild(bodyDiv);
            makeInteractive(bodyDiv);
        }

        // VALIDAÇÃO SEGURA DO FECHAMENTO
        if (roteiro.fechamento && typeof roteiro.fechamento === 'string' && roteiro.fechamento.trim() !== '') {
            const closingDiv = document.createElement('div');
            closingDiv.id = `element-${++elementCounter}`;
            closingDiv.className = 'draggable-item is-text';
            closingDiv.setAttribute('contenteditable', 'true');
            closingDiv.innerHTML = roteiro.fechamento;
            closingDiv.style.fontFamily = 'Aguila';
            closingDiv.style.fontSize = '14px';
            closingDiv.style.color = textColor;
            closingDiv.style.textAlign = 'center';
            closingDiv.style.width = '250px';
            closingDiv.setAttribute('data-x', bodyPosX);
            closingDiv.setAttribute('data-y', bodyPosY + 150);
            closingDiv.style.transform = `translate(${bodyPosX}px, ${bodyPosY + 150}px)`;
            slideContainer.appendChild(closingDiv);
            makeInteractive(closingDiv);
        }
    }


    function loadState(elementsData) {
        elementsData.forEach(data => createElementFromState(data));
    }

    function updateWatermark() {
        // ✅ VERIFICAR SE O USUÁRIO JÁ REMOVEU A MARCA D'ÁGUA
        const currentRoteiro = allRoteiros[currentSlideIndex];

        // Se há slideState E não há marca d'água salva = usuário removeu
        if (currentRoteiro && currentRoteiro.slideState && currentRoteiro.slideState.length > 0) {
            const hasWatermarkInState = currentRoteiro.slideState.some(el => el.type === 'watermark');
            if (!hasWatermarkInState) {
                console.log('Usuário removeu marca d\'água - não recriar');
                return; // ✅ NÃO RECRIAR!
            }
        }

        let watermarkEl = slideContainer.querySelector('.is-watermark');
        let currentPosX = 111, currentPosY = 311; // Posição padrão

        // ✅ SE JÁ EXISTE MARCA D'ÁGUA, PRESERVAR SUA POSIÇÃO
        if (watermarkEl) {
            currentPosX = parseInt(watermarkEl.getAttribute('data-x')) || 111;
            currentPosY = parseInt(watermarkEl.getAttribute('data-y')) || 311;
            watermarkEl.remove();
        }

        const isDark = isColorDark(slideContainer.style.backgroundColor);
        const watermarkSrc = isDark ? watermarkData.clara : watermarkData.escura;

        watermarkEl = document.createElement('div');
        watermarkEl.id = `element-${elementCounter++}`;
        watermarkEl.className = 'draggable-item is-watermark';

        const img = document.createElement('img');
        img.src = watermarkSrc;
        watermarkEl.appendChild(img);

        watermarkEl.style.width = '96px';
        watermarkEl.style.height = 'auto';

        // ✅ USAR POSIÇÃO PRESERVADA
        watermarkEl.setAttribute('data-x', currentPosX);
        watermarkEl.setAttribute('data-y', currentPosY);
        watermarkEl.style.transform = `translate(${currentPosX}px, ${currentPosY}px)`;

        slideContainer.appendChild(watermarkEl);
        makeInteractive(watermarkEl);

        // ✅ SALVAR ESTADO APÓS CRIAR
        debouncedSaveState();
    }

    function renderSlide() {
        const roteiro = allRoteiros[currentSlideIndex];
        if (!roteiro) return;
        slideContainer.innerHTML = '';
        const snapLinesHTML = `<div class="snap-line-v" id="snap-v-25"></div><div class="snap-line-v" id="snap-v-50"></div><div class="snap-line-v" id="snap-v-75"></div><div class="snap-line-h" id="snap-h-25"></div><div class="snap-line-h" id="snap-h-50"></div><div class="snap-line-h" id="snap-h-75"></div>`;
        slideContainer.innerHTML = snapLinesHTML;
        elementCounter = 0;
        const slideGlobalIndex = allRoteiros.findIndex(r => r === roteiro);
        const isOdd = slideGlobalIndex % 2 !== 0;
        const defaultBgColor = isOdd ? colors.terracota : colors.lightGray;
        const finalBgColor = roteiro.backgroundColor || defaultBgColor;
        slideContainer.style.backgroundColor = finalBgColor;
        const textColor = isColorDark(finalBgColor) ? colors.lightGray : colors.terracota;

        if (roteiro.slideState && roteiro.slideState.length > 0) {
            loadState(roteiro.slideState);
        } else {
            // ▼▼▼ A MUDANÇA É AQUI ▼▼▼
            createDefaultDOMElements(roteiro, textColor, finalBgColor);
        }

        slideCounter.textContent = `${currentSlideIndex + 1} / ${allRoteiros.length}`;
        prevBtn.disabled = currentSlideIndex === 0;
        nextBtn.disabled = currentSlideIndex === allRoteiros.length - 1;
        colorPicker.value = rgbToHex(finalBgColor);
        activeElement = null;
        updateToolbarState();
        updateWatermark();
        saveState();
    }

    // === FUNÇÕES DA GALERIA DO CLOUDINARY ===

    async function loadGalleryImages(search = '', page = 1) {
        try {
            const galleryLoading = document.getElementById('galleryLoading');
            const galleryGrid = document.getElementById('galleryGrid');

            if (galleryLoading) galleryLoading.style.display = 'block';
            if (galleryGrid) galleryGrid.innerHTML = '';

            console.log('Carregando sua biblioteca do Cloudinary...');

            // Fazer chamada para o Google Apps Script buscar suas imagens do Cloudinary
            const url = `${API_BASE_URL}?action=getGalleryImages&search=${encodeURIComponent(search)}&page=${page}`;

            const response = await fetch(url);
            const data = await response.json();

            console.log('Resposta da API:', data);

            if (data.status === 'success') {
                galleryImages = data.images;
                totalPages = data.total_pages || 1;
                currentPage = data.current_page || 1;

                displayGalleryImages();
                console.log(`Carregadas ${galleryImages.length} imagens`);
            } else {
                console.error('Erro na API:', data.error);
                if (galleryGrid) galleryGrid.innerHTML = '<div style="text-align: center; padding: 2rem;">Erro: ' + (data.error || 'Falha na API') + '</div>';
            }

        } catch (error) {
            console.error('Erro ao conectar:', error);
            const galleryGrid = document.getElementById('galleryGrid');
            if (galleryGrid) galleryGrid.innerHTML = '<div style="text-align: center; padding: 2rem;">Erro de conexão: ' + error.message + '</div>';
        } finally {
            const galleryLoading = document.getElementById('galleryLoading');
            if (galleryLoading) galleryLoading.style.display = 'none';
        }
    }



    // Função temporária para gerar imagens de exemplo
    // Em produção, substitua por uma chamada real para sua API

    // Linha 1031 - VERSÃO NOVA COM BOTÃO DE DELETAR
    function displayGalleryImages() {
        const galleryGrid = document.getElementById('galleryGrid');
        if (!galleryGrid) {
            console.error('galleryGrid não encontrado');
            return;
        }

        if (!galleryImages || galleryImages.length === 0) {
            galleryGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">Nenhuma imagem encontrada</div>';
            return;
        }

        galleryGrid.innerHTML = '';

        galleryImages.forEach(image => {
            // Container da imagem com posição relativa
            const item = document.createElement('div');
            item.style.cssText = `
            aspect-ratio: 1;
            border: 2px solid transparent;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: all 0.2s;
            position: relative;
        `;

            const thumbUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/c_fill,w_200,h_200/${image.public_id}.${image.format}`;

            // Imagem
            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = image.public_id;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';

            // 🗑️ BOTÃO DE DELETAR
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.style.cssText = `
            position: absolute;
            top: 4px;
            right: 4px;
            background: rgba(255, 255, 255, 0.9);
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            z-index: 10;
        `;

            // Mostrar lixeirinha no hover
            item.addEventListener('mouseenter', () => {
                deleteBtn.style.opacity = '1';
            });

            item.addEventListener('mouseleave', () => {
                deleteBtn.style.opacity = '0';
            });

            // Evento de hover
            item.onmouseenter = () => {
                item.style.transform = 'translateY(-2px)';
                item.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
            };

            item.onmouseleave = () => {
                if (selectedGalleryImage !== image) {
                    item.style.transform = 'translateY(0)';
                    item.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }
            };

            // Evento de clique para seleção
            img.onclick = (e) => {
                e.stopPropagation();

                // Remover seleção anterior
                document.querySelectorAll('#galleryGrid div').forEach(i => {
                    i.style.borderColor = 'transparent';
                    i.style.transform = 'translateY(0)';
                    i.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                });

                // Selecionar atual
                item.style.borderColor = '#C36640';
                item.style.boxShadow = '0 0 0 2px rgba(195, 102, 64, 0.3)';
                item.style.transform = 'translateY(-2px)';

                selectedGalleryImage = {
                    ...image,
                    url: thumbUrl,
                    secure_url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${image.public_id}.${image.format}`
                };

                // Ativar botão de adicionar
                const addBtn = document.getElementById('addSelectedImageBtn');
                if (addBtn) {
                    addBtn.disabled = false;
                    addBtn.style.opacity = '1';
                    addBtn.textContent = 'Adicionar ao Slide';
                    addBtn.style.background = '#C36640';
                }

                console.log('Imagem selecionada:', selectedGalleryImage);
            };

            // 🗑️ EVENTO PARA DELETAR IMAGEM
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();

                if (confirm(`🗑️ Tem certeza que deseja deletar esta imagem?\n\n${image.public_id}`)) {
                    try {
                        deleteBtn.innerHTML = '⏳';

                        // Por enquanto, apenas remove da tela (você precisa implementar delete no backend)
                        console.log('Deletando:', image.public_id);
                        item.remove();

                        // Se estava selecionada, limpar seleção
                        if (selectedGalleryImage && selectedGalleryImage.public_id === image.public_id) {
                            selectedGalleryImage = null;
                            const addBtn = document.getElementById('addSelectedImageBtn');
                            if (addBtn) {
                                addBtn.disabled = true;
                                addBtn.style.opacity = '0.5';
                                addBtn.textContent = 'Selecione uma Imagem';
                            }
                        }

                        alert('✅ Imagem removida da visualização!');

                    } catch (error) {
                        console.error('❌ Erro ao deletar:', error);
                        alert('❌ Erro ao deletar imagem');
                        deleteBtn.innerHTML = '🗑️';
                    }
                }
            };

            // Montar elementos
            item.appendChild(img);
            item.appendChild(deleteBtn);
            galleryGrid.appendChild(item);
        });

        console.log(`Exibindo ${galleryImages.length} imagens na galeria`);
    }





    // === CRIAR MODAL DINAMICAMENTE ===
    function createGalleryModal() {
        if (document.getElementById('galleryModal')) return;

        const modal = document.createElement('div');
        modal.id = 'galleryModal';
        modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 10000;
        display: none;
        justify-content: center;
        align-items: center;
    `;

        modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 600px; max-width: 90vw; max-height: 85vh; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
            <!-- Cabeçalho -->
            <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;">
                <h3 style="margin: 0; color: #333; font-size: 1.1rem; font-weight: 600;">🖼️ Cloudinary</h3>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button id="addToCloudinaryBtn" style="background: #4A90E2; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">📁 Adicionar</button>
                    <button id="refreshGalleryBtn" style="background: #C36640; color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">🔄 Atualizar</button>
                    <button id="closeGalleryModal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; padding: 0.2rem; line-height: 1;">×</button>
                </div>
            </div>
            
            <!-- Conteúdo -->
            <div style="padding: 0;">
                <div id="galleryLoading" style="text-align: center; padding: 3rem; color: #666; font-size: 0.9rem;">Carregando imagens...</div>
                
                <!-- Grid de imagens com scroll -->
                <div id="galleryGrid" style="
                    display: grid; 
                    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); 
                    gap: 12px; 
                    height: 400px; 
                    overflow-y: auto; 
                    padding: 1rem; 
                    background: #fafbfc;
                    border-top: 1px solid #eee;
                    border-bottom: 1px solid #eee;
                "></div>
                
                <!-- Rodapé com botão -->
                <div style="padding: 1rem; background: #f8f9fa; text-align: center;">
                    <button id="addSelectedImageBtn" style="
                        background: #C36640; 
                        color: white; 
                        border: none; 
                        padding: 0.6rem 1.2rem; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 500; 
                        font-size: 0.9rem;
                        opacity: 0.5;
                        min-width: 160px;
                    " disabled>Selecione uma Imagem</button>
                </div>
            </div>
            
            <!-- Input hidden para upload -->
            <input type="file" id="cloudinaryModalFileInput" accept="image/*" style="display: none;" multiple>
        </div>
    `;

        document.body.appendChild(modal);
        setupGalleryEvents();
    }

    async function handleCloudinaryUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        try {
            // Show loading state
            const addToCloudinaryBtn = document.getElementById('addToCloudinaryBtn');
            if (addToCloudinaryBtn) {
                addToCloudinaryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
                addToCloudinaryBtn.disabled = true;
            }

            // Upload each file
            for (const file of files) {
                const cloudinaryUrl = await uploadImageSmartDuplicate(file);
                if (cloudinaryUrl) {
                    console.log('Arquivo enviado com sucesso:', cloudinaryUrl);
                }
            }

            // Refresh gallery to show new images
            currentPage = 1;
            await loadGalleryImages('', currentPage);

            // Reset file input
            event.target.value = '';

            alert('Imagens enviadas com sucesso!');

        } catch (error) {
            console.error('Erro ao enviar arquivo:', error);
            alert('Erro ao enviar arquivo: ' + error.message);
        } finally {
            // Restore button state
            const addToCloudinaryBtn = document.getElementById('addToCloudinaryBtn');
            if (addToCloudinaryBtn) {
                addToCloudinaryBtn.innerHTML = 'Adicionar';
                addToCloudinaryBtn.disabled = false;
            }
        }
    }


    function setupGalleryEvents() {
        const closeBtn = document.getElementById('closeGalleryModal');
        const refreshBtn = document.getElementById('refreshGalleryBtn');
        const addBtn = document.getElementById('addSelectedImageBtn');
        const addToCloudinaryBtn = document.getElementById('addToCloudinaryBtn');

        // Botão de fechar
        if (closeBtn) {
            closeBtn.onclick = closeGalleryModalFunc;
        }

        // Botão de atualizar
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                currentPage = 1;
                loadGalleryImages('', currentPage);
            };
        }

        // Botão de adicionar imagem selecionada ao slide
        if (addBtn) {
            addBtn.onclick = () => {
                if (selectedGalleryImage) {
                    addImageFromGallery();
                }
            };
        }

        // 📁 BOTÃO NOVO - ADICIONAR DO PC PARA CLOUDINARY
        if (addToCloudinaryBtn) {
            addToCloudinaryBtn.onclick = () => {
                const fileInput = document.getElementById('cloudinaryModalFileInput');
                fileInput.click();
            };
        }

        // 📁 EVENTO DO INPUT DE ARQUIVO
        const fileInput = document.getElementById('cloudinaryModalFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', handleCloudinaryUpload);
        }

        // Fechar clicando fora da modal
        const modal = document.getElementById('galleryModal');
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    closeGalleryModalFunc();
                }
            };
        }
    }

    function openGalleryModal() {
        createGalleryModal();
        document.getElementById('galleryModal').style.display = 'flex';
        loadGalleryImages();
    }

    function closeGalleryModalFunc() {
        const modal = document.getElementById('galleryModal');
        if (modal) modal.style.display = 'none';
        selectedGalleryImage = null;
    }





    // --- API & DADOS ---
    async function uploadImageToCloudinary(file) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.error) {
                    throw new Error(data.error.message);
                }
                throw new Error(`Falha no upload. Status: ${response.status}`);
            }

            return data.secure_url;
        } catch (error) {
            console.error('Erro detalhado no upload:', error);
            alert('Erro ao carregar a imagem: ' + error.message);
            return null;
        } finally {
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
        }
    }

    // === FUNÇÕES PARA PREVENÇÃO DE DUPLICATAS ===

    // Função para gerar hash SHA-256 do arquivo
    async function generateFileHash(file) {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Retornar primeiros 16 caracteres (suficiente para uniqueness)
        return hashHex.substring(0, 16);
    }

    // Função para verificar se imagem já existe
    async function checkIfImageExists(publicId) {
        try {
            // Tentar acessar a imagem via URL de thumbnail pequeno
            const testUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/c_limit,w_10/${publicId}`;

            const response = await fetch(testUrl, {
                method: 'HEAD'
            });

            // Se status 200, a imagem existe
            if (response.status === 200) {
                const fullUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;
                return fullUrl;
            }

            return null; // Não existe

        } catch (error) {
            return null; // Erro indica que não existe
        }
    }

    // Upload inteligente sem duplicatas
    // Upload inteligente sem duplicatas (VERSÃO CORRIGIDA FINAL)
    async function uploadImageSmartDuplicate(file) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');

        try {
            console.log('Gerando hash do arquivo...');

            // 1. Gerar hash do arquivo
            const fileHash = await generateFileHash(file);
            const publicId = `carousel_${fileHash}`;

            console.log('Hash gerado:', fileHash, 'Public ID:', publicId);

            // 2. Verificar se já existe
            const existingUrl = await checkIfImageExists(publicId);
            if (existingUrl) {
                console.log('✅ Imagem já existe! Retornando URL:', existingUrl);
                return existingUrl;
            }

            console.log('⬆️ Imagem nova, fazendo upload...');

            // 3. Não existe - fazer upload com public_id único
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('public_id', publicId);
            // ❌ REMOVIDO: formData.append('overwrite', false);
            // ❌ REMOVIDO: formData.append('invalidate', true);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.error) {
                console.error('Erro Cloudinary:', data.error);
                throw new Error(data.error.message || 'Erro no upload');
            }

            console.log('✅ Upload realizado com sucesso:', data.secure_url);
            return data.secure_url;

        } catch (error) {
            console.error('Erro no upload inteligente:', error);
            throw error;
        } finally {
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
        }
    }



    async function uploadBlobToCloudinary(blob, resourceType = 'image') {
        try {
            const formData = new FormData();
            formData.append('file', blob);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('resource_type', resourceType);

            const response = await fetch(
                `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (!response.ok) {
                throw new Error(`Erro no upload: ${response.status}`);
            }

            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error('Erro no upload para Cloudinary:', error);
            throw error;
        }
    }
    async function removeImageBackground(imageElement) {
        if (!imageElement || !imageElement.src) {
            alert('Nenhuma imagem selecionada');
            return;
        }

        try {
            // Mostra loader
            removeBgBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            removeBgBtn.disabled = true;

            // Faz a requisição para Remove.bg API
            const formData = new FormData();
            formData.append('size', 'auto');
            formData.append('image_url', imageElement.src);

            const response = await fetch('https://api.remove.bg/v1.0/removebg', {
                method: 'POST',
                headers: {
                    'X-Api-Key': REMOVE_BG_API_KEY
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
            }

            // Converte a resposta em blob
            const blob = await response.blob();

            // Faz upload do resultado para Cloudinary
            const cloudinaryUrl = await uploadBlobToCloudinary(blob, 'image');

            if (cloudinaryUrl) {
                // Atualiza a imagem no elemento
                imageElement.src = cloudinaryUrl;
                saveState();
                alert('Fundo removido com sucesso!');
            }

        } catch (error) {
            console.error('Erro ao remover fundo:', error);
            alert('Erro ao remover fundo da imagem: ' + error.message);
        } finally {
            // Restaura o botão
            removeBgBtn.innerHTML = '<i class="fas fa-cut"></i>';
            removeBgBtn.disabled = false;
        }
    }


    async function fetchThemes() {
        const targetDropdowns = [introThemeDropdown, themeDropdown];
        targetDropdowns.forEach(d => { d.innerHTML = '<option>Carregando...</option>'; d.disabled = true; });
        try {
            const res = await fetch(`${API_BASE_URL}?action=getTemas`);
            if (!res.ok) throw new Error(`Erro de rede: ${res.status}`);
            const data = await res.json();
            if (data.status === 'success') {
                targetDropdowns.forEach(d => {
                    d.innerHTML = '<option value="" disabled selected>Selecione um tema...</option>';
                    data.data.forEach(theme => d.innerHTML += `<option value="${theme}">${theme}</option>`);
                    d.disabled = false;
                });
            } else { throw new Error('API retornou status de falha.'); }
        } catch (err) {
            console.error('Falha ao buscar temas.', err);
            targetDropdowns.forEach(d => { d.innerHTML = '<option>Erro ao carregar</option>'; });
        }
    }

    async function fetchRoteiros(tema, targetDropdown) {
        targetDropdown.innerHTML = '<option>Carregando...</option>';
        targetDropdown.disabled = true;
        try {
            const res = await fetch(`${API_BASE_URL}?action=getRoteiro&tema=${encodeURIComponent(tema)}`);
            if (!res.ok) throw new Error(`Erro de rede: ${res.status}`);
            const data = await res.json();
            if (data.status === 'success' && data.data && data.data.length > 0) {
                themeRoteiros = data.data;
                targetDropdown.innerHTML = '<option value="" disabled selected>Selecione um roteiro...</option>';
                themeRoteiros.forEach((c, i) => {
                    if (!c.title) console.warn('AVISO: Roteiro no índice', i, 'não tem um título (c.title). Roteiro:', c);
                    targetDropdown.innerHTML += `<option value="${i}">${(c.title || `Roteiro Sem Título ${i + 1}`).replace(/<[^>]*>/g, '')}</option>`;
                });
                targetDropdown.disabled = false;
                if (targetDropdown.id === 'introCarouselDropdown') confirmBtn.classList.remove('hidden');
            } else {
                targetDropdown.innerHTML = '<option>Nenhum roteiro encontrado</option>';
                if (targetDropdown.id === 'introCarouselDropdown') confirmBtn.classList.add('hidden');
            }
        } catch (err) {
            console.error('Falha CRÍTICA ao buscar roteiros.', err);
            targetDropdown.innerHTML = '<option>Erro ao carregar</option>';
        }
    }

    async function loadRoteiroByIndex(index) {
        const carouselOriginal = themeRoteiros[index];
        if (!carouselOriginal) return;
        const carrosselId = carouselOriginal.slides[0]?.carrossel_id;
        if (!carrosselId) {
            console.error("ID do carrossel não encontrado.");
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}?action=getEditedRoteiro&carrossel_id=${carrosselId}`);
            const result = await response.json();
            if (result.status === 'success' && result.data) {
                allRoteiros = result.data;
            } else {
                allRoteiros = JSON.parse(JSON.stringify(carouselOriginal.slides));
                const firstSlide = allRoteiros[0];
                if (firstSlide && firstSlide.titulo && firstSlide.titulo.trim() !== '') {
                    const titleSlide = { ...firstSlide, corpo: '', fechamento: '' };
                    allRoteiros.unshift(titleSlide);
                    allRoteiros[1].titulo = '';
                }
                const lastSlideData = carouselOriginal.slides[carouselOriginal.slides.length - 1];
                if (lastSlideData && lastSlideData.fechamento && lastSlideData.fechamento.trim() !== '') {
                    const closingSlide = { ...lastSlideData, titulo: '', corpo: lastSlideData.fechamento };
                    allRoteiros.push(closingSlide);
                }
            }
        } catch (error) {
            console.error("Erro ao buscar roteiro editado, carregando original.", error);
            allRoteiros = JSON.parse(JSON.stringify(carouselOriginal.slides));
        }
        history = [];
        historyIndex = -1;
        currentSlideIndex = 0;
        renderSlide();
    }

    async function saveEditedRoteiro() {
        saveCurrentSlideContent();
        if (!allRoteiros || allRoteiros.length === 0) {
            alert('Não há nada para salvar.');
            return;
        }
        const saveBtnIcon = saveBtn.querySelector('i');
        saveBtnIcon.classList.remove('fa-save');
        saveBtnIcon.classList.add('fa-spinner', 'fa-spin');
        saveBtn.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}?action=salvarRoteiroEditado`, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ slides: allRoteiros })
            });
            alert('Roteiro salvo com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Ocorreu um erro ao tentar salvar o roteiro.');
        } finally {
            saveBtnIcon.classList.remove('fa-spinner', 'fa-spin');
            saveBtnIcon.classList.add('fa-save');
            saveBtn.disabled = false;
        }
    }


    // --- NAVEGAÇÃO E AÇÕES DE SLIDE ---
    function showPrevSlide() {
        saveCurrentSlideContent();
        if (currentSlideIndex > 0) {
            currentSlideIndex--;
            renderSlide();
        }
    }

    function showNextSlide() {
        saveCurrentSlideContent();
        if (currentSlideIndex < allRoteiros.length - 1) {
            currentSlideIndex++;
            renderSlide();
        }
    }

    function addNewSlide() {
        saveCurrentSlideContent();
        const currentRoteiro = allRoteiros[currentSlideIndex];
        const newSlide = {
            titulo: '', corpo: 'Novo Slide', backgroundColor: null,
            carrossel_id: currentRoteiro.carrossel_id,
            tema_geral: currentRoteiro.tema_geral,
            slideState: null
        };
        allRoteiros.splice(currentSlideIndex + 1, 0, newSlide);
        currentSlideIndex++;
        renderSlide();
        saveState();
    }

    function removeCurrentSlide() {
        if (allRoteiros.length <= 1) {
            alert('Não é possível remover o único slide.');
            return;
        }
        if (confirm('Tem certeza que deseja remover este slide?')) {
            allRoteiros.splice(currentSlideIndex, 1);
            if (currentSlideIndex >= allRoteiros.length) {
                currentSlideIndex = allRoteiros.length - 1;
            }
            renderSlide();
            saveState();
        }
    }

    // --- FERRAMENTAS DO EDITOR ---
    function updateToolbarState() {
        const textControls = [boldBtn, italicBtn, underlineBtn, leftAlignBtn, centerAlignBtn, rightAlignBtn, justifyBtn, fontFamilySelect, fontSizeSelect, textColorPicker, lineHeightSelect];
        const generalControls = [deleteBtn, bringToFrontBtn, sendToBackBtn, opacitySlider];

        [...textControls, ...generalControls].forEach(control => {
            if (control) control.disabled = !activeElement;
        });

        if (resetZoomBtn) resetZoomBtn.disabled = false;

        // Controla o botão de remover fundo
        const isImageSelected = activeElement && activeElement.classList.contains('is-image');
        if (removeBgBtn) {
            removeBgBtn.disabled = !isImageSelected;
        }

        if (!activeElement) {
            textControls.forEach(control => {
                if (control) control.classList.remove('active');
            });
            return;
        }
        if (opacitySlider) {
            const currentOpacity = activeElement.style.opacity || '1';
            opacitySlider.value = parseFloat(currentOpacity);
        }
        if (!activeElement.classList.contains('is-text')) {
            textControls.forEach(control => {
                if (control) control.disabled = true;
            });
            return;
        }


        // Damos um pequeno tempo para o navegador atualizar a seleção
        setTimeout(() => {
            // --- INÍCIO DA CORREÇÃO DO BUG 2 ---
            const selection = window.getSelection();
            let elementAtCursor = activeElement; // Começa com o bloco como padrão

            // Se houver uma seleção (ou apenas um cursor), encontra o elemento mais específico
            if (selection.rangeCount > 0 && selection.anchorNode) {
                const node = selection.anchorNode;
                // Se o nó for texto puro, pega o elemento pai (ex: um <span>). Senão, usa o próprio nó.
                const parentElement = node.nodeType === 3 ? node.parentElement : node;
                // Garante que o elemento encontrado está dentro do nosso bloco de texto ativo
                if (activeElement.contains(parentElement)) {
                    elementAtCursor = parentElement;
                }
            }
            // Usa o 'elementAtCursor' para pegar os estilos, em vez do 'activeElement' genérico
            const styles = window.getComputedStyle(elementAtCursor);
            // --- FIM DA CORREÇÃO DO BUG 2 ---

            boldBtn.classList.toggle('active', document.queryCommandState('bold'));
            italicBtn.classList.toggle('active', document.queryCommandState('italic'));
            underlineBtn.classList.toggle('active', document.queryCommandState('underline'));

            leftAlignBtn.classList.toggle('active', styles.textAlign === 'left' || styles.textAlign === 'start');
            centerAlignBtn.classList.toggle('active', styles.textAlign === 'center');
            rightAlignBtn.classList.toggle('active', styles.textAlign === 'right' || styles.textAlign === 'end');
            justifyBtn.classList.toggle('active', styles.textAlign === 'justify');

            const selectionFont = document.queryCommandValue('fontName').replace(/['"]/g, '');
            fontFamilySelect.value = selectionFont || styles.fontFamily.replace(/['"]/g, '');

            // Agora esta linha pegará o tamanho correto do elemento no cursor
            fontSizeSelect.value = parseInt(styles.fontSize, 10);

            const computedLineHeight = styles.lineHeight;
            if (computedLineHeight === 'normal') {
                lineHeightSelect.value = '1.2';
            } else {
                const lineHeightValue = parseFloat(computedLineHeight);
                const fontSizeValue = parseFloat(styles.fontSize);
                if (fontSizeValue > 0) {
                    const finalRatio = (lineHeightValue / fontSizeValue).toFixed(1);
                    lineHeightSelect.value = finalRatio;
                }
            }
            const selectionColor = document.queryCommandValue('foreColor');
            textColorPicker.value = rgbToHex(selectionColor || styles.color);
            opacitySlider.value = styles.opacity;
        }, 10);
    }

    function applyFormat(command) {
        if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
            document.execCommand(command, false, null);
            activeElement.focus();
            saveState();
            updateToolbarState();
        }
    }

    function setStyle(property, value) {
        if (activeElement) {
            // --- INÍCIO DA CORREÇÃO DO BUG 1 ---
            // Se a propriedade que estamos mudando é o tamanho da fonte...
            if (property === 'fontSize') {
                // ...primeiro, encontramos todos os <span> internos que têm um tamanho de fonte customizado...
                const spansWithFontSize = activeElement.querySelectorAll('span[style*="font-size"]');
                // ...e removemos o estilo de tamanho de fonte deles.
                spansWithFontSize.forEach(span => {
                    span.style.fontSize = ''; // Limpa o tamanho da fonte do span
                    // Se o span ficar sem nenhum estilo, podemos removê-lo completamente
                    if (span.style.cssText === '') {
                        const parent = span.parentNode;
                        while (span.firstChild) {
                            parent.insertBefore(span.firstChild, span);
                        }
                        parent.removeChild(span);
                    }
                });
            }

            activeElement.style[property] = value;
            saveState();
            updateToolbarState();
        }
    }

    function applyFontSizeToSelection(size) {
        if (!activeElement || !activeElement.isContentEditable) return;

        activeElement.focus();
        const selection = window.getSelection();

        // --- AQUI ESTÁ A NOVA LÓGICA ---
        // Se a seleção estiver "colapsada" (ou seja, nada destacado, só o cursor piscando)
        if (selection.isCollapsed) {
            // Aplica o estilo ao bloco inteiro, como era antigamente
            setStyle('fontSize', size);
            // E para a execução da função aqui.
            return;
        }

        // Se algo estiver selecionado, a função continua e executa a lógica
        // que aplica o estilo apenas na seleção, como fizemos antes.
        document.execCommand('fontSize', false, '1');

        const fontElement = activeElement.querySelector('font[size="1"]');

        if (fontElement) {
            const span = document.createElement('span');
            span.style.fontSize = size;
            while (fontElement.firstChild) {
                span.appendChild(fontElement.firstChild);
            }
            fontElement.parentNode.replaceChild(span, fontElement);
        }

        saveState();
        updateToolbarState();
    }

    function addNewTextBox() {
        const newText = document.createElement('div');
        newText.id = `element-${elementCounter++}`;
        newText.className = 'draggable-item is-text';
        newText.setAttribute('contenteditable', 'true');
        newText.innerHTML = "Novo Texto";
        newText.style.width = '280px';
        newText.style.height = '80px';
        newText.style.fontFamily = 'Aguila';
        newText.style.fontSize = '16px';
        const posX = 20, posY = 50;
        newText.setAttribute('data-x', posX);
        newText.setAttribute('data-y', posY);
        newText.style.transform = `translate(${posX}px, ${posY}px)`;
        slideContainer.appendChild(newText);
        makeInteractive(newText);
        setActiveElement({ currentTarget: newText });
        saveState();
    }

    function exportSlideAsPNG() {
        if (activeElement) {
            activeElement.classList.remove('selected');
            activeElement = null;
        }
        html2canvas(slideContainer, { scale: 10, useCORS: true, backgroundColor: null }).then(canvas => {
            const link = document.createElement('a');
            link.download = `slide_${currentSlideIndex + 1}_exportado.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }




    async function exportAllSlidesAsPNG() {
        if (!allRoteiros || allRoteiros.length === 0) {
            return;
        }

        // ✅ CRIAR OVERLAY DE BLOQUEIO ANTES DE TUDO
        const blockingOverlay = document.createElement('div');
        blockingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.3);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: 'Inter', sans-serif;
    `;

        blockingOverlay.innerHTML = `
        <div style="background: white; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); font-size: 16px; color: #333;">
            Exportando slides... Aguarde!
        </div>
    `;

        document.body.appendChild(blockingOverlay);

        const exportAllBtn = document.getElementById('exportAllSlidesBtn');
        const originalContent = exportAllBtn.innerHTML;
        exportAllBtn.disabled = true;
        exportAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // ✅ CARREGAR JSZip PRIMEIRO (ESTA PARTE ESTAVA FALTANDO OU QUEBRADA!)
            if (typeof JSZip === 'undefined') {
                exportAllBtn.innerHTML = '<i class="fas fa-download"></i>';
                console.log('Carregando JSZip...');

                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                    script.onload = () => {
                        console.log('JSZip carregado com sucesso');
                        resolve();
                    };
                    script.onerror = (error) => {
                        console.error('Erro ao carregar JSZip:', error);
                        reject(new Error('Falha ao carregar JSZip'));
                    };
                    document.head.appendChild(script);
                });

                exportAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            console.log('Iniciando criação do ZIP...');
            const zip = new JSZip(); // Agora JSZip está disponível!

            // Obter nome do roteiro para o ZIP
            let zipName = 'carrossel-completo';
            const carouselDropdown = document.getElementById('carouselDropdown');
            if (carouselDropdown && carouselDropdown.selectedOptions[0]) {
                const roteiroName = carouselDropdown.selectedOptions[0].text;
                if (roteiroName && roteiroName !== 'Selecione um roteiro...' && roteiroName !== 'Carregando...') {
                    zipName = roteiroName
                        .replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '')
                        .replace(/\s+/g, '-')
                        .toLowerCase();
                }
            }

            // Salvar estado atual
            saveCurrentSlideContent();

            // ✅ USAR ABORDAGEM SIMPLES QUE FUNCIONA - renderSlide normal
            const originalSlideIndex = currentSlideIndex;
            const originalActiveElement = activeElement;

            console.log(`Exportando ${allRoteiros.length} slides...`);

            for (let i = 0; i < allRoteiros.length; i++) {
                try {
                    console.log(`Processando slide ${i + 1}...`);

                    // Mudar para o slide
                    currentSlideIndex = i;
                    renderSlide();

                    // Aguardar renderização completa
                    await new Promise(resolve => setTimeout(resolve, 800)); // Mais tempo

                    // Remover qualquer elemento selecionado
                    if (activeElement) {
                        activeElement.classList.remove('selected');
                        activeElement = null;
                    }

                    // Aguardar após remoção
                    await new Promise(resolve => setTimeout(resolve, 200));

                    console.log(`Capturando slide ${i + 1}...`);

                    // Capturar com configurações robustas
                    const canvas = await html2canvas(slideContainer, {
                        scale: 10,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false,
                        width: slideContainer.offsetWidth,
                        height: slideContainer.offsetHeight
                    });

                    if (canvas.width > 0 && canvas.height > 0) {
                        const blob = await new Promise(resolve => {
                            canvas.toBlob(resolve, 'image/png', 0.9);
                        });

                        if (blob) {
                            const slideNumber = (i + 1).toString().padStart(2, '0');
                            zip.file(`slide-${slideNumber}.png`, blob);
                            console.log(`✅ Slide ${slideNumber} adicionado ao ZIP`);
                        } else {
                            console.error(`❌ Falha ao gerar blob para slide ${i + 1}`);
                        }
                    } else {
                        console.error(`❌ Canvas vazio para slide ${i + 1}`);
                    }

                } catch (error) {
                    console.error(`❌ Erro no slide ${i + 1}:`, error);
                }
            }

            console.log('Restaurando estado original...');

            // Restaurar estado original
            currentSlideIndex = originalSlideIndex;
            renderSlide();
            await new Promise(resolve => setTimeout(resolve, 500));

            // Restaurar elemento ativo
            if (originalActiveElement && slideContainer.contains(originalActiveElement)) {
                activeElement = originalActiveElement;
                activeElement.classList.add('selected');
                updateToolbarState();
            }

            console.log('Gerando arquivo ZIP...');

            // Gerar ZIP
            const content = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            // Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${zipName}.zip`;
            link.click();

            console.log('✅ Exportação concluída com sucesso!');

        } catch (error) {
            console.error('Erro na exportação:', error);
            alert('Erro na exportação: ' + error.message);

            // ... seu código de erro atual ...

        } finally {
            // ✅ SEMPRE REMOVER O OVERLAY
            document.body.removeChild(blockingOverlay);

            exportAllBtn.disabled = false;
            exportAllBtn.innerHTML = originalContent;
        }
    }

    // ✅ FUNÇÃO AUXILIAR
    function isColorDark(rgbColor) {
        if (!rgbColor) return false;

        if (rgbColor.startsWith('#')) {
            let r = 0, g = 0, b = 0;
            if (rgbColor.length === 4) {
                r = parseInt(rgbColor[1] + rgbColor[1], 16);
                g = parseInt(rgbColor[2] + rgbColor[2], 16);
                b = parseInt(rgbColor[3] + rgbColor[3], 16);
            } else if (rgbColor.length === 7) {
                r = parseInt(rgbColor[1] + rgbColor[2], 16);
                g = parseInt(rgbColor[3] + rgbColor[4], 16);
                b = parseInt(rgbColor[5] + rgbColor[6], 16);
            }
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
        }

        const sep = rgbColor.indexOf(',') > -1 ? ',' : ' ';
        const rgb = rgbColor.substr(4).split(')')[0].split(sep);
        let r = parseInt(rgb[0], 10), g = parseInt(rgb[1], 10), b = parseInt(rgb[2], 10);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
    }




    // === SETUP DE EVENTOS DO DOM ===
    function setupEventListeners() {
        const addSafeListener = (el, event, handler) => {
            if (el) el.addEventListener(event, handler);
        };

        addSafeListener(imageUpload, 'change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const cloudinaryUrl = await uploadImageSmartDuplicate(file);
            e.target.value = '';
            if (!cloudinaryUrl) return;
            const tempImg = new Image();
            tempImg.onload = () => {
                const ratio = tempImg.naturalWidth / tempImg.naturalHeight;
                const initialWidth = 150;
                const imgContainer = document.createElement('div');
                imgContainer.id = `element-${elementCounter++}`;
                imgContainer.className = 'draggable-item is-image';
                const img = document.createElement('img');
                img.src = cloudinaryUrl;
                imgContainer.appendChild(img);
                const handle = document.createElement('div');
                handle.className = 'rotation-handle';
                imgContainer.appendChild(handle);
                imgContainer.style.width = initialWidth + 'px';
                imgContainer.style.height = (initialWidth / ratio) + 'px';
                imgContainer.setAttribute('data-ratio', ratio);
                imgContainer.setAttribute('data-x', '50');
                imgContainer.setAttribute('data-y', '50');
                imgContainer.style.transform = 'translate(50px, 50px)';
                slideContainer.appendChild(imgContainer);
                makeInteractive(imgContainer);
                saveState();
            };
            tempImg.src = cloudinaryUrl;
        });

        addSafeListener(introThemeDropdown, 'change', e => { confirmBtn.classList.add('hidden'); fetchRoteiros(e.target.value, introCarouselDropdown); });
        addSafeListener(introCarouselDropdown, 'change', () => {
            checkConfirmButton();
        });
        // Evento para mostrar botão quando digitar no modo IA
        const iaThemeInput = document.getElementById('iaThemeInput');
        if (iaThemeInput) {
            iaThemeInput.addEventListener('input', () => {
                checkConfirmButton();
            });
        }


        addSafeListener(confirmBtn, 'click', async () => {
            if (selectedMode === 'planilha') {
                // Modo planilha (comportamento original)
                const idx = parseInt(introCarouselDropdown.value, 10);
                if (!isNaN(idx)) {
                    themeRoteiros[idx];
                    themeDropdown.value = introThemeDropdown.value;
                    carouselDropdown.innerHTML = introCarouselDropdown.innerHTML;
                    carouselDropdown.value = introCarouselDropdown.value;
                    topBarsWrapper.classList.remove('hidden');
                    mainElement.classList.remove('hidden');
                    introScreen.classList.add('hidden');
                    loadRoteiroByIndex(idx);
                }
            } else if (selectedMode === 'ia') {
                const tema = document.getElementById('iaThemeInput').value.trim();
                const numSlides = parseInt(document.getElementById('iaNumSlides').value);
                const tom = document.getElementById('iaTom').value;
                const modelo = document.getElementById('iaModelo').value;

                if (!tema) {
                    alert('Por favor, digite um assunto.');
                    return;
                }

                const loadingSpinner = document.getElementById('loadingSpinner');
                loadingSpinner.classList.remove('hidden');

                try {
                    const response = await fetch(`${API_BASE_URL}?action=generateWithGemini&tema=${encodeURIComponent(tema)}&numSlides=${numSlides}&tom=${encodeURIComponent(tom)}&modelo=${encodeURIComponent(modelo)}`);
                    const data = await response.json();

                    console.log('Resposta da API:', data); // DEBUG

                    if (data.status === 'error') {
                        alert('Erro ao gerar roteiro: ' + data.message);
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    if (!data.slides || !Array.isArray(data.slides)) {
                        alert('Formato inválido retornado pela IA');
                        loadingSpinner.classList.add('hidden');
                        return;
                    }

                    // Carregar os slides gerados pela IA
                    allRoteiros = data.slides;
                    currentSlideIndex = 0;

                    topBarsWrapper.classList.remove('hidden');
                    mainElement.classList.remove('hidden');
                    introScreen.classList.add('hidden');
                    loadingSpinner.classList.add('hidden');

                    renderSlide();

                } catch (error) {
                    console.error('Erro completo:', error);
                    alert('Erro: ' + error.message);
                    loadingSpinner.classList.add('hidden');
                }
            }

        });


        addSafeListener(themeDropdown, 'change', e => fetchRoteiros(e.target.value, carouselDropdown));
        addSafeListener(carouselDropdown, 'change', e => loadRoteiroByIndex(parseInt(e.target.value, 10)));
        addSafeListener(prevBtn, 'click', showPrevSlide);
        addSafeListener(nextBtn, 'click', showNextSlide);
        addSafeListener(addSlideBtn, 'click', addNewSlide);
        addSafeListener(removeSlideBtn, 'click', removeCurrentSlide);
        addSafeListener(exportPngBtn, 'click', exportSlideAsPNG);
        addSafeListener(exportAllSlidesBtn, 'click', exportAllSlidesAsPNG);

        // Upload local (PC)
        addSafeListener(document.getElementById('uploadLocalBtn'), 'click', () => {
            imageUpload.click();
        });

        // Upload Cloudinary (remover o botão antigo e usar o novo)
        addSafeListener(document.getElementById('uploadCloudBtn'), 'click', openGalleryModal);
        addSafeListener(removeBgBtn, 'click', () => {
            if (!activeElement || !activeElement.classList.contains('is-image')) {
                alert('Selecione uma imagem primeiro');
                return;
            }

            const imageElement = activeElement.querySelector('img');
            if (imageElement) {
                removeImageBackground(imageElement);
            }
        });
        addSafeListener(saveBtn, 'click', saveEditedRoteiro);

        addSafeListener(addTextBtn, 'click', addNewTextBox);
        addSafeListener(boldBtn, 'click', () => applyFormat('bold'));
        addSafeListener(italicBtn, 'click', () => applyFormat('italic'));
        addSafeListener(underlineBtn, 'click', () => applyFormat('underline'));

        const styleAndSave = (prop, val) => { setStyle(prop, val); };
        addSafeListener(leftAlignBtn, 'click', () => styleAndSave('textAlign', 'left'));
        addSafeListener(centerAlignBtn, 'click', () => styleAndSave('textAlign', 'center'));
        addSafeListener(rightAlignBtn, 'click', () => styleAndSave('textAlign', 'right'));
        addSafeListener(justifyBtn, 'click', () => styleAndSave('textAlign', 'justify'));
        addSafeListener(fontFamilySelect, 'change', e => styleAndSave('fontFamily', e.target.value));
        addSafeListener(fontSizeSelect, 'change', e => applyFontSizeToSelection(e.target.value + 'px'));
        addSafeListener(lineHeightSelect, 'change', e => styleAndSave('lineHeight', e.target.value));
        addSafeListener(textColorPicker, 'input', e => {
            if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
                activeElement.focus();
                document.execCommand('foreColor', false, e.target.value);
                saveState();
            }
        });
        addSafeListener(opacitySlider, 'input', e => styleAndSave('opacity', e.target.value));

        const layerAndSave = (action) => {
            if (activeElement) {
                action();
                saveState();
            }
        };
        addSafeListener(bringToFrontBtn, 'click', () => layerAndSave(() => {
            const zIndexes = Array.from(slideContainer.querySelectorAll('.draggable-item:not(.selected)')).map(el => parseInt(el.style.zIndex, 10) || 0);
            const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
            activeElement.style.zIndex = maxZ + 1;
        }));
        addSafeListener(sendToBackBtn, 'click', () => layerAndSave(() => {
            const otherElements = slideContainer.querySelectorAll('.draggable-item:not(.selected)');
            otherElements.forEach(el => {
                const currentZ = parseInt(el.style.zIndex, 10) || 0;
                el.style.zIndex = currentZ + 1;
            });
            activeElement.style.zIndex = 0;
        }));
        addSafeListener(deleteBtn, 'click', () => {
            if (activeElement) {
                const prevActive = activeElement;
                activeElement = null;
                updateToolbarState();
                prevActive.remove();
                saveState();
            }
        });
        const colorActionAndSave = (e) => {
            const color = e.currentTarget.dataset.color;
            colorPicker.value = color;
            slideContainer.style.backgroundColor = color;
            updateWatermark();
            saveState();
        };
        addSafeListener(colorPicker, 'input', e => {
            slideContainer.style.backgroundColor = e.target.value;
            updateWatermark();
            saveState();
        });
        document.querySelectorAll('.color-shortcut').forEach(btn => { addSafeListener(btn, 'click', colorActionAndSave); });
        document.querySelectorAll('.text-color-shortcut').forEach(btn => {
            addSafeListener(btn, 'click', e => {
                const color = e.currentTarget.dataset.color;
                textColorPicker.value = color;
                if (activeElement && activeElement.getAttribute('contenteditable') === 'true') {
                    activeElement.focus();
                    document.execCommand('foreColor', false, color);
                    saveState();
                }
            });
        });

        // ▼▼▼ LISTENER DE SELECTIONCHANGE CORRIGIDO ▼▼▼
        addSafeListener(document, 'selectionchange', () => {
            const currentEditable = document.activeElement;
            // Verifica se o elemento focado é um editor de texto
            if (currentEditable && currentEditable.getAttribute('contenteditable')) {
                // Compara o elemento focado com o nosso 'activeElement' global
                if (activeElement === currentEditable) {
                    // Se for o mesmo, significa que estamos apenas movendo o cursor dentro dele.
                    // Nesse caso, só precisamos atualizar o estado da barra de ferramentas.
                    updateToolbarState();
                } else {
                    // Se for diferente, significa que clicamos em um novo bloco de texto.
                    // Nesse caso, executamos a função completa para definir o novo elemento ativo.
                    setActiveElement({ currentTarget: currentEditable });
                }
            }
        });
        // ▲▲▲ FIM DA CORREÇÃO ▲▲▲

        addSafeListener(document, 'copy', handleCopy);
        addSafeListener(document, 'paste', handlePasteFromEvent);

        document.addEventListener('click', function (e) {
            const isClickInsideSlide = slideContainer.contains(e.target);
            const isClickOnToolbar = e.target.closest('.editor-toolbar');
            const isClickOnHeader = e.target.closest('.main-header-bar');

            if (!isClickInsideSlide && !isClickOnToolbar && !isClickOnHeader) {
                if (activeElement) {
                    activeElement.classList.remove('selected');
                    activeElement = null;
                    updateToolbarState();
                }
            }
        });

        const zoomPanContainer = document.getElementById('zoom-pan-container');
        addSafeListener(zoomPanContainer, 'wheel', (event) => {
            event.preventDefault();
            const rect = zoomPanContainer.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const zoomIntensity = 0.05;
            const wheel = event.deltaY < 0 ? 1 : -1;
            const scrollZoomFactor = Math.exp(wheel * zoomIntensity);
            const minScale = 1, maxScale = 5;
            const prevSlidePosX = slidePosX, prevSlidePosY = slidePosY;
            const oldScale = currentScale;
            currentScale = Math.max(minScale, Math.min(maxScale, oldScale * scrollZoomFactor));
            if (currentScale === 1) {
                slidePosX = 0;
                slidePosY = 0;
            } else {
                const actualZoomFactor = currentScale / oldScale;
                slidePosX = mouseX - (mouseX - prevSlidePosX) * actualZoomFactor;
                slidePosY = mouseY - (mouseY - prevSlidePosY) * actualZoomFactor;
            }
            updateSlideTransform();
        });
        interact(zoomPanContainer).draggable({
            onstart: function () {
                if (currentScale > 1) {
                    document.body.classList.add('is-panning');
                }
            },
            onmove: function (event) {
                if (currentScale > 1) {
                    slidePosX += event.dx;
                    slidePosY += event.dy;
                    updateSlideTransform();
                }
            },
            onend: function () {
                document.body.classList.remove('is-panning');
            }
        });
        addSafeListener(resetZoomBtn, 'click', () => {
            currentScale = 1;
            slidePosX = 0;
            slidePosY = 0;
            updateSlideTransform();
        });

        addSafeListener(document, 'keydown', (event) => {
            const isTyping = document.activeElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

            if ((event.ctrlKey || event.metaKey) && !isTyping) {
                let handled = false;
                switch (event.key.toLowerCase()) {
                    case 'z': undo(); handled = true; break;
                    case 'y': redo(); handled = true; break;
                }
                if (handled) {
                    event.preventDefault();
                    return;
                }
            }

            if ((event.key || '').toLowerCase() === 'delete' || (event.key || '').toLowerCase() === 'backspace') {
                if (activeElement && !isTyping) {
                    event.preventDefault();
                    deleteBtn.click();
                }
            }

            if (event.code === 'Space' && !isTyping) {
                event.preventDefault();
                if (!isPanning) {
                    isPanning = true;
                    document.body.classList.add('is-panning');
                }
                return;
            }

            if (isTyping) return;

            switch (event.key) {
                case 'ArrowLeft':
                    if (!prevBtn.disabled) showPrevSlide();
                    break;
                case 'ArrowRight':
                    if (!nextBtn.disabled) showNextSlide();
                    break;
            }
        });
        addSafeListener(document, 'keyup', (event) => {
            if (event.code === 'Space') {
                isPanning = false;
                document.body.classList.remove('is-panning');
            }
        });

        // === EVENT LISTENERS DA GALERIA ===
        addSafeListener(closeGalleryModal, 'click', closeGalleryModalFunc);

        // Fechar modal clicando fora dela
        addSafeListener(galleryModal, 'click', (e) => {
            if (e.target === galleryModal) {
                closeGalleryModalFunc();
            }
        });

        // Buscar na galeria
        addSafeListener(searchGalleryBtn, 'click', () => {
            const searchTerm = gallerySearchInput.value.trim();
            currentPage = 1;
            loadGalleryImages(searchTerm, currentPage);
        });

        // Enter para buscar
        addSafeListener(gallerySearchInput, 'keypress', (e) => {
            if (e.key === 'Enter') {
                searchGalleryBtn.click();
            }
        });

        // Atualizar galeria
        addSafeListener(refreshGalleryBtn, 'click', () => {
            gallerySearchInput.value = '';
            currentPage = 1;
            loadGalleryImages('', currentPage);
        });

        // Navegação de páginas
        addSafeListener(prevPageBtn, 'click', () => {
            if (currentPage > 1) {
                currentPage--;
                const searchTerm = gallerySearchInput.value.trim();
                loadGalleryImages(searchTerm, currentPage);
            }
        });

        addSafeListener(nextPageBtn, 'click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                const searchTerm = gallerySearchInput.value.trim();
                loadGalleryImages(searchTerm, currentPage);
            }
        });

        // Duplo clique para adicionar imagem
        addSafeListener(galleryGrid, 'dblclick', (e) => {
            const galleryItem = e.target.closest('.gallery-item');
            if (galleryItem && selectedGalleryImage) {
                addImageFromGallery();
            }

            // === HANDLER PARA SALVAR NA PLANILHA "Roteiros_editados" ===
            saveBtn.addEventListener('click', async () => {
                try {
                    console.log('🔄 Iniciando salvamento dos roteiros editados...');

                    // 1. Garante que o estado atual do slide foi sincronizado
                    // (copia history[historyIndex] -> allRoteiros[currentSlideIndex].slideState)
                    saveCurrentSlideContent();

                    // 2. Verifica se temos roteiros carregados
                    if (!allRoteiros || allRoteiros.length === 0) {
                        alert('⚠️ Nenhum roteiro carregado para salvar.');
                        return;
                    }

                    // 3. Monta o array de slides com todos os dados necessários
                    const slides = [];
                    for (let i = 0; i < allRoteiros.length; i++) {
                        const roteiro = allRoteiros[i];

                        // Pula slides inválidos ou sem carrossel_id
                        if (!roteiro || !roteiro.carrossel_id) {
                            console.warn(`⚠️ Slide ${i} sem carrossel_id, pulando...`);
                            continue;
                        }

                        // Monta o objeto do slide para enviar
                        slides.push({
                            carrossel_id: roteiro.carrossel_id,
                            titulo: roteiro.titulo || '',
                            corpo: roteiro.corpo || '',
                            fechamento: roteiro.fechamento || '',
                            slideState: roteiro.slideState || [], // Elementos editados (texto/imagem)
                            backgroundColor: roteiro.backgroundColor || slideContainer.style.backgroundColor || null
                        });
                    }

                    // 4. Valida se temos slides válidos
                    if (slides.length === 0) {
                        alert('❌ Nenhum slide com carrossel_id válido encontrado.\n\nVerifique se você carregou um roteiro antes de salvar.');
                        return;
                    }

                    console.log(`📤 Enviando ${slides.length} slides para salvamento...`);

                    // 5. Mostra loading para o usuário
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '⏳ Salvando...';

                    // 6. Envia para o Google Apps Script
                    const response = await fetch(`${API_BASE_URL}?action=salvarRoteiroEditado`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ slides })
                    });

                    // 7. Processa a resposta
                    const data = await response.json();

                    if (data && data.status === 'success') {
                        console.log('✅ Roteiro salvo com sucesso:', data);
                        alert(`✅ Roteiro salvo na aba "Roteiros_editados" com sucesso!\n\n📊 ${slides.length} slides salvos`);
                    } else {
                        throw new Error(data?.message || data?.error || 'Resposta inválida do servidor');
                    }

                } catch (error) {
                    console.error('❌ Erro ao salvar roteiro:', error);

                    // Mensagem de erro mais amigável
                    let errorMessage = 'Erro ao salvar roteiro:\n\n';
                    if (error.message.includes('fetch')) {
                        errorMessage += '🌐 Problema de conexão com o servidor.\nVerifique sua internet e tente novamente.';
                    } else if (error.message.includes('JSON')) {
                        errorMessage += '📄 Problema ao processar resposta do servidor.\nO Apps Script pode estar com erro.';
                    } else {
                        errorMessage += `⚠️ ${error.message}`;
                    }

                    alert(errorMessage);

                } finally {
                    // 8. Restaura o botão sempre, mesmo em caso de erro
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '💾 Salvar';
                }
            });

            console.log('✅ Handler de salvamento configurado com sucesso!');

        });
    }

    // --- INICIALIZAÇÃO DA APLICAÇÃO ---
    setupEventListeners();
    fetchThemes();

    // === SOLUÇÃO FORÇADA PARA MODAL ===
    document.addEventListener('DOMContentLoaded', function () {
        // Esperar 100ms para garantir que tudo foi carregado
        setTimeout(function () {
            const modal = document.getElementById('galleryModal');
            if (modal) {
                // Forçar ocultar a modal
                modal.style.display = 'none';
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                modal.classList.remove('show');

                console.log('Modal forçadamente ocultada!');

                // Observar mudanças e manter oculta
                const observer = new MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                            if (!modal.classList.contains('show')) {
                                modal.style.display = 'none';
                            }
                        }
                    });
                });

                observer.observe(modal, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }
        }, 100);
    });

    // Função para mostrar modal apenas quando chamada explicitamente

    // Função para esconder modal

    function addImageFromGallery() {
        if (!selectedGalleryImage) {
            console.log('Nenhuma imagem selecionada');
            return;
        }

        console.log('Adicionando imagem ao slide:', selectedGalleryImage);
        const imageUrl = selectedGalleryImage.secure_url || selectedGalleryImage.url;

        // Usar exatamente o mesmo código que funciona para as imagens do PC
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.onload = () => {
            const ratio = tempImg.naturalWidth / tempImg.naturalHeight;
            const initialWidth = 150;

            // Criar DIV container (não IMG direta!)
            const imgContainer = document.createElement('div');
            imgContainer.id = `element-${elementCounter++}`;
            imgContainer.className = 'draggable-item is-image';

            // Criar IMG dentro do DIV
            const img = document.createElement('img');
            img.src = imageUrl;
            imgContainer.appendChild(img);

            // Criar handle de rotação
            const handle = document.createElement('div');
            handle.className = 'rotation-handle';
            imgContainer.appendChild(handle);

            // Aplicar estilos e atributos IGUAIS ao PC
            imgContainer.style.width = `${initialWidth}px`;
            imgContainer.style.height = `${initialWidth / ratio}px`;
            imgContainer.setAttribute('data-ratio', ratio);
            imgContainer.setAttribute('data-x', 50);
            imgContainer.setAttribute('data-y', 50);
            imgContainer.style.transform = 'translate(50px, 50px) rotate(0deg)';
            imgContainer.style.zIndex = '11';

            slideContainer.appendChild(imgContainer);
            makeInteractive(imgContainer);

            // Selecionar automaticamente
            setActiveElement({ currentTarget: imgContainer });
        };
        tempImg.src = imageUrl;

        closeGalleryModalFunc();
    }

})
