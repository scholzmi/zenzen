document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const previewLayerElement = document.getElementById('preview-layer');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');

    // Game State
    let gameBoard = [], score = 0, highscore = 0;
    let figuresInSlots = [null, null, null];
    let selectedFigure = null, selectedSlotIndex = -1;
    const TOUCH_Y_OFFSET = -120;
    let gameConfig = {};
    const GRID_SIZE = 9;
    let isDragging = false;
    let lastTap = 0, tapTimeout = null;
    const doubleTapDelay = 300;

    async function initializeGame() {
        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');
        
        const configLoaded = await loadConfiguration();
        if (!configLoaded) return;

        const serverVersion = gameConfig.gameVersion || "1.0";
        const localVersion = getCookie('gameVersion');
        if (serverVersion !== localVersion) {
            setCookie('highscore', '0', 365);
            setCookie('gameVersion', serverVersion, 365);
        }
        highscore = parseInt(getCookie('highscore') || '0', 10);
        highscoreElement.textContent = highscore;
        score = 0;
        scoreElement.textContent = score;

        createGameBoard();
        generateNewFigures();
    }

    async function loadConfiguration() {
        try {
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`Network response was not ok`);
            gameConfig = await response.json();
            return true;
        } catch (error) { console.error('Error loading config:', error); return false; }
    }

    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        previewLayerElement.innerHTML = '';
        gameBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        const cellSize = gameBoardElement.clientWidth / GRID_SIZE;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                gameBoardElement.appendChild(cell);
            }
        }
        document.documentElement.style.setProperty('--figure-block-size', `${Math.max(10, cellSize / 2.5)}px`);
    }

    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });
    }

    function handleTapOrDragStart(e) {
        e.preventDefault();
        const targetSlot = e.currentTarget;
        const now = new Date().getTime();
        if ((now - lastTap) < doubleTapDelay) {
            clearTimeout(tapTimeout);
            rotateFigureInSlot(parseInt(targetSlot.dataset.slotId, 10));
        } else {
            lastTap = now;
            handleDragStart(e.touches ? e.touches[0] : e, targetSlot);
        }
    }

    function rotateFigureInSlot(slotIndex) {
        if (!figuresInSlots[slotIndex]) return;
        figuresInSlots[slotIndex].form = rotateFigure90Degrees(figuresInSlots[slotIndex].form);
        drawFigureInSlot(slotIndex);
        if (isGameOver()) handleGameOver();
    }

    function handleDragStart(event, targetSlot) {
        if (isDragging) return;
        const slotIndex = parseInt(targetSlot.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) return;

        isDragging = true;
        selectedSlotIndex = slotIndex;
        selectedFigure = JSON.parse(JSON.stringify(figuresInSlots[selectedSlotIndex]));
        targetSlot.classList.add('dragging');
        
        const moveHandler = (e) => handleInteractionMove(e.touches ? e.touches[0] : e);
        const endHandler = (e) => {
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            handleInteractionEnd(e.changedTouches ? e.changedTouches[0] : e);
        };
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        handleInteractionMove(event);
    }

    function handleInteractionMove(event) {
        if (!isDragging) return;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / cellSize);
        const cellY = Math.round(yPos / cellSize);
        drawPreview(selectedFigure, cellX, cellY);
    }

    function handleInteractionEnd(event) {
        if (!isDragging) return;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / cellSize);
        const cellY = Math.round(yPos / cellSize);
        placeFigure(selectedFigure, cellX, cellY);
        document.querySelector('.figure-slot.dragging')?.classList.remove('dragging');
        selectedFigure = null;
        selectedSlotIndex = -1;
        isDragging = false;
        previewLayerElement.innerHTML = '';
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        if (!canPlace(figure, placeX, placeY)) return;
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.color;
        }));
        drawGameBoard();
        const points = clearFullLines() + figure.form.flat().reduce((a, b) => a + b, 0);
        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);
        figuresInSlots[selectedSlotIndex] = null;
        drawFigureInSlot(selectedSlotIndex);
        if (figuresInSlots.every(f => f === null)) generateNewFigures();
        if (isGameOver()) handleGameOver();
    }

    function generateNewFigures() {
        const { zonkProbability, jokerProbability } = gameConfig;
        for (let i = 0; i < 3; i++) {
            let pool, category;
            const rand = Math.random();
            if (rand < zonkProbability) { pool = gameConfig.figures.zonkPool; category = 'zonk'; }
            else if (rand < jokerProbability + zonkProbability) { pool = gameConfig.figures.jokerPool; category = 'joker'; }
            else { pool = gameConfig.figures.normalPool; category = 'normal'; }
            let figure = { ...pool[Math.floor(Math.random() * pool.length)] };
            figure.category = category;
            figure.color = gameConfig.figurePalettes[category].placed;
            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) { figure.form = rotateFigure90Degrees(figure.form); }
            figuresInSlots[i] = figure;
            drawFigureInSlot(i);
        }
        if (isGameOver()) handleGameOver();
    }

    function canPlace(figure, startX, startY) {
        for (let y = 0; y < figure.form.length; y++) {
            for (let x = 0; x < figure.form[y].length; x++) {
                if (figure.form[y][x] === 1) {
                    const boardX = startX + x;
                    const boardY = startY + y;
                    if (boardX < 0 || boardX >= GRID_SIZE || boardY < 0 || boardY >= GRID_SIZE || gameBoard[boardY][boardX] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    function isGameOver() {
        return figuresInSlots.every(figure => {
            if (!figure) return true;
            let currentForm = figure.form;
            for(let i=0; i < 4; i++) {
                for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                    for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                        if (canPlace({form: currentForm}, x, y)) return false;
                    }
                }
                currentForm = rotateFigure90Degrees(currentForm);
            }
            return true;
        });
    }

    function clearFullLines() {
        let rows = [], cols = [];
        for (let y = 0; y < GRID_SIZE; y++) if (gameBoard[y].every(cell => cell !== 0)) rows.push(y);
        for (let x = 0; x < GRID_SIZE; x++) if (gameBoard.every(row => row[x] !== 0)) cols.push(x);
        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        return Math.pow(rows.length + cols.length, 2) * 10;
    }

    function handleGameOver() {
        gameBoardElement.classList.add('crumble');
        let isNewHighscore = score > highscore;
        if (isNewHighscore) {
            highscore = score;
            setCookie('highscore', highscore, 365);
        }
        setTimeout(() => {
            if (isNewHighscore) {
                highscoreElement.textContent = highscore;
                highscoreElement.classList.add('pulsate');
                setTimeout(initializeGame, 1800);
            } else {
                initializeGame();
            }
        }, 2500);
    }

    function drawGameBoard() {
        gameBoard.forEach((row, y) => row.forEach((content, x) => {
            const cell = gameBoardElement.children[y * GRID_SIZE + x];
            cell.className = 'cell';
            if (content !== 0) {
                cell.classList.add('occupied');
                cell.style.backgroundColor = content;
            } else {
                cell.style.backgroundColor = '';
            }
        }));
    }

    function drawPreview(figure, centerX, centerY) {
        previewLayerElement.innerHTML = '';
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        const canBePlaced = canPlace(figure, placeX, placeY);
        const color = canBePlaced ? figure.color + '99' : 'rgba(255, 77, 77, 0.6)';
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) {
                const boardY = placeY + y, boardX = placeX + x;
                const previewBlock = document.createElement('div');
                previewBlock.className = 'preview-block';
                previewBlock.style.gridRowStart = boardY + 1;
                previewBlock.style.gridColumnStart = boardX + 1;
                previewBlock.style.backgroundColor = color;
                previewLayerElement.appendChild(previewBlock);
            }
        }));
    }
    
    // ... (Restliche Funktionen bleiben unverändert)

    initializeGame();
});