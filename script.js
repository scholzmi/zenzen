document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
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
    const TOUCH_Y_OFFSET = -30;
    let gameConfig = {};
    const GRID_SIZE = 9;
    let isDragging = false;
    let lastTap = 0, tapTimeout = null;
    const doubleTapDelay = 300;

    async function initializeGame() {
        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');
        
        const configLoaded = await loadConfiguration();
        if (!configLoaded) {
            document.body.innerHTML = "<h1>Fehler</h1><p>config.json konnte nicht geladen werden oder ist fehlerhaft. Bitte stellen Sie sicher, dass die Datei existiert und valide ist.</p>";
            return;
        }

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
            if (versionInfoElement) versionInfoElement.textContent = gameConfig.version || "?.??";
            if (lastModificationElement) lastModificationElement.textContent = gameConfig.lastModification || "N/A";
            
            if (!gameConfig.figures || !gameConfig.figures.normal || !gameConfig.figures.zonk || !gameConfig.figures.joker) {
                throw new Error("Figurenpools in config.json sind nicht korrekt definiert.");
            }
            return true;
        } catch (error) { console.error('Error loading config:', error); return false; }
    }

    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        gameBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        const cellSize = gameBoardElement.clientWidth / GRID_SIZE;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.x = x;
                cell.dataset.y = y;
                cell.style.setProperty('--delay', Math.random());
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
        const timesince = now - lastTap;

        if (timesince < doubleTapDelay && timesince > 0) {
            clearTimeout(tapTimeout);
            rotateFigureInSlot(parseInt(targetSlot.dataset.slotId, 10));
            return;
        }
        
        lastTap = new Date().getTime();
        
        const event = e.touches ? e.touches[0] : e;
        handleDragStart(event, targetSlot);
    }

    function rotateFigureInSlot(slotIndex) {
        if (!figuresInSlots[slotIndex]) return;
        figuresInSlots[slotIndex].form = rotateFigure90Degrees(figuresInSlots[slotIndex].form);
        drawFigureInSlot(slotIndex);
        if (isGameOver()) {
            handleGameOver();
        }
    }

    function handleDragStart(event, targetSlot) {
        if (isDragging) return;
        const slotIndex = parseInt(targetSlot.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) return;

        isDragging = true;

        selectedSlotIndex = slotIndex;
        selectedFigure = JSON.parse(JSON.stringify(figuresInSlots[selectedSlotIndex]));
        targetSlot.classList.add('dragging');
        
        const moveHandler = (moveEvent) => {
            handleInteractionMove(moveEvent.touches ? moveEvent.touches[0] : moveEvent);
        };

        const endHandler = (endEvent) => {
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            handleInteractionEnd(endEvent.changedTouches ? endEvent.changedTouches[0] : endEvent);
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
        drawGameBoard();
    }
    
    function rotateFigure90Degrees(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).reverse();
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);

        if (!canPlace(figure, placeX, placeY)) return;

        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.category;
        }));

        const points = clearFullLines() + figure.form.flat().reduce((a, b) => a + b, 0);
        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);

        if (score > highscore) {
          highscore = score;
          highscoreElement.textContent = highscore;
          setCookie('highscore', highscore, 365);
        }

        figuresInSlots[selectedSlotIndex] = null;
        drawFigureInSlot(selectedSlotIndex);
        
        if (figuresInSlots.every(f => f === null)) {
            generateNewFigures();
        }

        if (isGameOver()) {
            handleGameOver();
        }
    }

    function generateNewFigures() {
        const { zonkProbability, jokerProbability } = gameConfig;
        for (let i = 0; i < 3; i++) {
            let pool, category;
            const rand = Math.random();
            if (rand < zonkProbability) { pool = gameConfig.figures.zonk; category = 'zonk'; }
            else if (rand < jokerProbability + zonkProbability) { pool = gameConfig.figures.joker; category = 'joker'; }
            else { pool = gameConfig.figures.normal; category = 'normal'; }
            
            let figureData = { ...pool[Math.floor(Math.random() * pool.length)] };
            let figure = { ...figureData, form: parseShape(figureData.shape), category: category }; // Speichert die Kategorie
            
            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) {
                figure.form = rotateFigure90Degrees(figure.form);
            }
            figuresInSlots[i] = figure;
            drawFigureInSlot(i);
        }
        drawGameBoard();
        if (isGameOver()) {
            handleGameOver();
        }
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
    // 1. Die "Zerbröseln"-Animation wird wie bisher gestartet.
    gameBoardElement.classList.add('crumble');
    
    // Logik für den Highscore
    let isNewHighscore = score > highscore;
    if (isNewHighscore) {
        highscore = score;
        setCookie('highscore', highscore, 365);
    }

    // 2. Wir warten, bis die Animation (1.5s) sicher abgeschlossen ist.
    setTimeout(() => {
        
        // 3. WICHTIG: Wir räumen das Spielfeld manuell auf, BEVOR etwas anderes passiert.
        //    Wir entfernen die Klassen von den Zellen, die sie als "besetzt" markieren.
        //    Das Spielfeld ist danach visuell leer, aber das Gitter bleibt erhalten.
        const allCells = gameBoardElement.querySelectorAll('.cell.occupied');
        allCells.forEach(cell => {
            cell.className = 'cell'; // Setzt die Zelle auf ihren Ursprungszustand zurück.
        });

        // 4. JETZT ERST entfernen wir die Klasse, die die Animation ausgelöst hat.
        gameBoardElement.classList.remove('crumble');

        // 5. Nun kann die restliche Logik auf einem sauberen Brett ohne Konflikte ablaufen.
        if (isNewHighscore) {
            highscoreElement.textContent = highscore;
            highscoreElement.classList.add('pulsate');
            setTimeout(initializeGame, 1800); // Warten auf die Puls-Animation
        } else {
            initializeGame();
        }

    }, 1600); // Wir warten 1,6 Sekunden, um sicherzugehen, dass die 1,5s Animation fertig ist.
}

    function drawGameBoard() {
        gameBoard.forEach((row, y) => row.forEach((content, x) => {
            const cell = gameBoardElement.children[y * GRID_SIZE + x];
            cell.className = 'cell';
            if (content !== 0) {
                cell.classList.add('occupied', `color-${content}`);
            }
        }));
    }

// NEU: Eine globale Variable, um die Zellen der aktuellen Vorschau zu speichern.
// Dies ist viel schneller, als das DOM jedes Mal neu abzufragen.
let currentPreviewCells = [];

// HINWEIS: Stelle sicher, dass diese Zeile im Skript existiert, aber AUSSERHALB einer Funktion.
// Falls sie schon da ist, ist alles gut. Falls nicht, füge sie hinzu.
let currentPreviewCells = [];

function drawPreview(figure, centerX, centerY) {
    
    // 1. ALTE VORSCHAU AUFRÄUMEN
    // Wir gehen durch die Zellen, die im letzten Frame zur Vorschau gehörten.
    currentPreviewCells.forEach(cell => {
        // Zuerst die reinen Vorschau-Marker entfernen.
        cell.classList.remove('preview', 'invalid');

        // JETZT DER ENTSCHEIDENDE PUNKT:
        // Entferne die temporäre Farbe nur dann, wenn die Zelle NICHT
        // bereits als 'occupied' (platziert) markiert ist.
        if (!cell.classList.contains('occupied')) {
            cell.classList.remove('color-normal', 'color-joker', 'color-zonk');
        }
    });
    currentPreviewCells = []; // Liste für den nächsten Frame leeren.

    // 2. NEUE VORSCHAU ZEICHNEN
    // Dieser Teil bleibt wie gehabt und funktioniert korrekt.
    const placeX = centerX - Math.floor(figure.form[0].length / 2);
    const placeY = centerY - Math.floor(figure.form.length / 2);
    const canBePlaced = canPlace(figure, placeX, placeY);
    
    figure.form.forEach((row, y) => {
        row.forEach((block, x) => {
            if (block === 1) {
                const boardY = placeY + y;
                const boardX = placeX + x;
                if (boardY >= 0 && boardY < GRID_SIZE && boardX >= 0 && boardX < GRID_SIZE) {
                    const cell = gameBoardElement.children[boardY * GRID_SIZE + boardX];
                    
                    cell.classList.add('preview');

                    if (canBePlaced) {
                        cell.classList.add(`color-${figure.category}`); 
                    } else {
                        cell.classList.add('invalid');
                    }
                    
                    // Die Zelle zur Liste hinzufügen, damit wir sie im nächsten Frame finden.
                    currentPreviewCells.push(cell);
                }
            }
        });
    });
}

    function drawFigureInSlot(index) {
        const slot = figureSlots[index];
        const figure = figuresInSlots[index];
        slot.innerHTML = '';
        if (figure) {
            const container = document.createElement('div');
            container.classList.add('figure-container');
            const blockSize = 'var(--figure-block-size)';
            container.style.gridTemplateRows = `repeat(${figure.form.length}, ${blockSize})`;
            container.style.gridTemplateColumns = `repeat(${figure.form[0].length}, ${blockSize})`;
            figure.form.forEach(row => row.forEach(block => {
                const blockDiv = document.createElement('div');
                if (block === 1) {
                    blockDiv.classList.add('figure-block', `color-${figure.category}`);
                }
                container.appendChild(blockDiv);
            }));
            slot.appendChild(container);
        }
    }

    function parseShape(shapeCoords) {
        let tempMatrix = Array.from({ length: 5 }, () => Array(5).fill(0));
        let minRow = 5, maxRow = -1, minCol = 5, maxCol = -1;
        shapeCoords.forEach(coord => {
            const row = Math.floor((coord - 1) / 5);
            const col = (coord - 1) % 5;
            tempMatrix[row][col] = 1;
            minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
        });
        return tempMatrix.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1));
    }
    
    function showScoreAnimation(value) {
        if (!scoreAnimationElement || value === 0) return;
        scoreAnimationElement.textContent = `+${value}`;
        scoreAnimationElement.classList.remove('animate');
        void scoreAnimationElement.offsetWidth;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const randX = boardRect.width * (0.2 + Math.random() * 0.6);
        const randY = boardRect.height * (0.1 + Math.random() * 0.2);
        scoreAnimationElement.style.left = `${randX}px`;
        scoreAnimationElement.style.top = `${randY}px`;
        scoreAnimationElement.classList.add('animate');
    }

    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = `${name}=${value || ""}${expires}; path=/; SameSite=Lax; Secure`;
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let c of ca) {
            c = c.trim();
            if (c.startsWith(nameEQ)) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    assignEventListeners();
    initializeGame();
});
