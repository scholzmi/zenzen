document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');
    const soundToggleButton = document.getElementById('sound-toggle');

    // Sound-Effekte laden
    const putSound = new Audio('sounds/put.mp3');
    const plopSound = new Audio('sounds/plop.mp3');
    const overSound = new Audio('sounds/over.mp3');

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
    let isMoveScheduled = false;
    let lastEvent = null;
    let currentPreviewCells = [];
    let currentZonkProbability = 0;
    let isSoundOn = true;
    let themes = {};

    // =======================================================
    // THEME- UND WETTER-FUNKTIONEN
    // =======================================================

    /**
     * Lädt die Konfiguration für die Wetter-Themes aus der themes.json Datei.
     */
    async function loadThemes() {
        try {
            const response = await fetch('themes.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error('themes.json konnte nicht geladen werden.');
            // KORREKTUR: Das gesamte JSON-Objekt in der 'themes'-Variable speichern.
            themes = await response.json();
            console.log('Themes erfolgreich geladen:', themes);
        } catch (error) {
            console.error('Fehler beim Laden der Themes:', error);
        }
    }

    function setBackgroundImage(imageUrl) {
        const fallbackUrl = 'bg.png';
        const finalImageUrl = imageUrl || fallbackUrl;

        const img = new Image();
        img.src = finalImageUrl;

        // Wird ausgeführt, WENN das Bild erfolgreich geladen wurde
        img.onload = () => {
            console.log(`Hintergrund erfolgreich geladen: ${finalImageUrl}`);
            document.body.style.setProperty('--background-image', `url('${finalImageUrl}')`);
            updateThemeFromImage(finalImageUrl);
        };

        // Wird ausgeführt, WENN das Bild NICHT gefunden wurde (404-Fehler)
        img.onerror = () => {
            console.warn(`Hintergrund '${finalImageUrl}' nicht gefunden. Lade Fallback: ${fallbackUrl}`);
            document.body.style.setProperty('--background-image', `url('${fallbackUrl}')`);
            updateThemeFromImage(fallbackUrl);
        };
    }

    function findAndApplyTheme(weatherCode) {
        let imageUrl = null; 

        // KORREKTUR: Wir müssen auf die 'themes'-Eigenschaft des Objekts zugreifen
        if (themes.themes && themes.themes[weatherCode]) {
            const theme = themes.themes[weatherCode];
            imageUrl = theme.background;
            console.log(`Wetter-Code ${weatherCode} gefunden! Versuche, Hintergrund zu laden: ${imageUrl}`);
        } else {
            console.log(`Kein Theme für Wetter-Code ${weatherCode} gefunden. Nutze Fallback.`);
        }

        setBackgroundImage(imageUrl);
    }

    /**
         * Überprüft, ob ein spezielles, datumsbasiertes Theme aktiv ist.
         * @returns {string|null} Die URL des Hintergrundbildes oder null, wenn kein Special aktiv ist.
         */
    function checkForSpecialTheme() {
        if (!themes.specials || !Array.isArray(themes.specials)) {
            return null;
        }

        const now = new Date();
        // Die Uhrzeit von 'now' muss nicht auf 0 gesetzt werden,
        // da wir jetzt den gesamten Tagesbereich prüfen.

        for (const special of themes.specials) {
            const startDate = new Date(special.startDate);
            const endDate = new Date(special.endDate);

            // Setzt die Uhrzeit auf den Anfang des Starttages
            startDate.setHours(0, 0, 0, 0);

            // KORREKTUR: Setzt die Uhrzeit auf das Ende des Endtages
            endDate.setHours(23, 59, 59, 999);


            if (now >= startDate && now <= endDate) {
                console.log(`Aha! Heute ist ein spezielles Datum. Event "${special.name}" ist aktiv.`);
                console.log(`Es wurde dieses Bild ausgewählt: ${special.background}`);
                return special.background;
            }
        }

        return null;
    }

    function applyTheme() {
        // 1. Zuerst auf spezielle Events prüfen
        const specialThemeUrl = checkForSpecialTheme();
        if (specialThemeUrl) {
            setBackgroundImage(specialThemeUrl);
            console.log("Special Event gefunden; heute kein Wetter");
            return; // Mission erfüllt, wir brauchen kein Wetter
        }

        // 2. Wenn kein Special aktiv ist, fahre mit der Wetter-Logik fort
        console.log("Kein spezielles Event heute. Ermittle das Wetter...");
        if (!navigator.geolocation) {
            console.error("Geolocation wird von diesem Browser nicht unterstützt.");
            findAndApplyTheme(null); // Fallback nutzen, wenn Geo nicht geht
            return;
        }

        const successCallback = async (position) => {
            const { latitude, longitude } = position.coords;
            console.log(`Standort ermittelt: Lat ${latitude}, Lon ${longitude}`);
            const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`;

            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`API-Antwort war nicht ok: ${response.status}`);
                const data = await response.json();
                const weatherCode = data.current.weather_code;
                console.log(`Aktueller Wetter-Code: ${weatherCode}`);
                findAndApplyTheme(weatherCode);
            } catch (error) {
                console.error("Fehler beim Abrufen der Wetterdaten:", error);
                findAndApplyTheme(null); // Fallback bei API-Fehler
            }
        };

        const errorCallback = (error) => {
            console.error(`Fehler bei der Standortermittlung: ${error.message}`);
            findAndApplyTheme(null); // Fallback bei Geo-Fehler
        };

        navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
    }

    // =======================================================
    // SPIEL-INITIALISIERUNG UND RESTLICHE LOGIK
    // =======================================================

    async function initializeGame() {
        // Sound-Zustand aus Cookie laden
        const savedSoundState = getCookie('isSoundOn');
        if (savedSoundState !== null) {
            isSoundOn = (savedSoundState === 'true');
        }
        if (soundToggleButton) {
            soundToggleButton.textContent = isSoundOn ? '🔊' : '🔈';
            soundToggleButton.style.opacity = isSoundOn ? '0.7' : '0.3';
        }

        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');
        if (Object.keys(gameConfig).length === 0) {
            const configLoaded = await loadConfiguration();
            if (!configLoaded) {
                document.body.innerHTML = "<h1>Fehler</h1><p>config.json ...</p>";
                return;
            }

        }
        currentZonkProbability = gameConfig.zonkProbability || 0;
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

    // ... (Hier folgen alle anderen Funktionen wie loadConfiguration, createGameBoard, handleDragStart, placeFigure etc. unverändert) ...
    // Ich füge sie hier der Vollständigkeit halber ein.

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

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    function updateThemeFromImage(imageUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = function () {
            const colorThief = new ColorThief();
            let palette = colorThief.getPalette(img, 8);

            function getColorBrightness(rgb) {
                // Formel zur Berechnung der wahrgenommenen Helligkeit
                return Math.sqrt(0.299 * (rgb[0] * rgb[0]) + 0.587 * (rgb[1] * rgb[1]) + 0.114 * (rgb[2] * rgb[2]));
            }

            // Sortiert die Palette von der dunkelsten [0] zur hellsten [7] Farbe
            palette.sort((a, b) => getColorBrightness(a) - getColorBrightness(b));

            // --- NEUE, VERBESSERTE FARBZUWEISUNG ---
            // Wir weisen die Farben jetzt so zu, dass die Figuren mehr Kontrast haben.
            console.log("Farbpalette nach Helligkeit sortiert:", palette);

            const textColor = palette[0]; // Die dunkelste Farbe für Text
            const zonkColor = palette[1]; // Die zweit-dunkelste für Zonk-Figuren
            const figureNormalColor = palette[2]; // Eine weitere dunkle Farbe für normale Figuren
            const jokerColor = palette[3]; // Die dritt-dunkelste für Joker-Figuren
            const borderColor = palette[4]; // Eine Farbe aus der Mitte für die Ränder
            const accentColor = palette[5]; // Eine hellere Akzentfarbe
            const mainBgColor = palette[7]; // Die hellste Farbe für den Spielfeld-Hintergrund

            const [bgH, bgS, bgL] = rgbToHsl(mainBgColor[0], mainBgColor[1], mainBgColor[2]),
                [textH, textS, textL] = rgbToHsl(textColor[0], textColor[1], textColor[2]),
                [borderH, borderS, borderL] = rgbToHsl(borderColor[0], borderColor[1], borderColor[2]),
                [figH, figS, figL] = rgbToHsl(figureNormalColor[0], figureNormalColor[1], figureNormalColor[2]),
                [jokerH, jokerS, jokerL] = rgbToHsl(jokerColor[0], jokerColor[1], jokerColor[2]),
                [zonkH, zonkS, zonkL] = rgbToHsl(zonkColor[0], zonkColor[1], zonkColor[2]),
                [accentH, accentS, accentL] = rgbToHsl(accentColor[0], accentColor[1], accentColor[2]);

            const root = document.documentElement;
            root.style.setProperty('--component-bg-h', bgH); root.style.setProperty('--component-bg-s', bgS + '%'); root.style.setProperty('--component-bg-l', bgL + '%');
            root.style.setProperty('--text-h', textH); root.style.setProperty('--text-s', textS + '%'); root.style.setProperty('--text-l', textL + '%');
            root.style.setProperty('--border-h', borderH); root.style.setProperty('--border-s', borderS + '%'); root.style.setProperty('--border-l', borderL + '%');
            root.style.setProperty('--figure-normal-h', figH); root.style.setProperty('--figure-normal-s', figS + '%'); root.style.setProperty('--figure-normal-l', figL + '%');
            root.style.setProperty('--figure-joker-h', jokerH); root.style.setProperty('--figure-joker-s', jokerS + '%'); root.style.setProperty('--figure-joker-l', jokerL + '%');
            root.style.setProperty('--figure-zonk-h', zonkH); root.style.setProperty('--figure-zonk-s', zonkS + '%'); root.style.setProperty('--figure-zonk-l', zonkL + '%');
            root.style.setProperty('--accent-h', accentH); root.style.setProperty('--accent-s', accentS + '%'); root.style.setProperty('--accent-l', accentL + '%');
        };
    }

    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });

        if (soundToggleButton) {
            soundToggleButton.addEventListener('click', toggleSound);
        }
    }

    // --- NEUER CODE FÜR MAUSRAD-STEUERUNG ---

    let componentOpacity = 0.05; // Startwert, passend zu deiner Einstellung
    const gameWrapper = document.querySelector('.game-wrapper');

    function updateOpacity(newOpacity) {
        // Begrenzt die Opazität zwischen 0.05 (fast unsichtbar) und 1.0 (komplett sichtbar)
        componentOpacity = Math.max(0.00, Math.min(1.0, newOpacity));
        document.documentElement.style.setProperty('--component-bg-a', componentOpacity);
    }

    // Setzt den Startwert beim Laden des Spiels
    updateOpacity(componentOpacity);

    // Event Listener für das Mausrad auf dem Spielfeld
    gameWrapper.addEventListener('wheel', (event) => {
        // Verhindert, dass die ganze Seite scrollt
        event.preventDefault();

        // deltaY ist negativ beim Hochscrollen, positiv beim Runterscrollen
        if (event.deltaY < 0) {
            // Hochscrollen -> sichtbarer machen
            updateOpacity(componentOpacity + 0.05);
        } else {
            // Runterscrollen -> durchsichtiger machen
            updateOpacity(componentOpacity - 0.05);
        }
    }, { passive: false }); // Wichtig, um preventDefault() zu erlauben

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

        // NEUER HANDLER für die Leertaste während des Ziehens
        const handleKeyPressDuringDrag = (e) => {
            // Prüfen, ob die Leertaste gedrückt wurde
            if (e.code === 'Space') {
                e.preventDefault(); // Verhindert, dass die Seite scrollt

                if (selectedFigure) {
                    selectedFigure.form = rotateFigure90Degrees(selectedFigure.form);
                    if (lastEvent) {
                        updatePreviewOnFrame();
                    }
                }
            }
        };

        // Event-Listener für Tastendruck wird AKTIVIERT
        document.addEventListener('keydown', handleKeyPressDuringDrag);

        const moveHandler = (moveEvent) => {
            handleInteractionMove(moveEvent.touches ? moveEvent.touches[0] : moveEvent);
        };

        const endHandler = (endEvent) => {
            // Event-Listener wird DEAKTIVIERT, wenn das Ziehen endet
            document.removeEventListener('keydown', handleKeyPressDuringDrag);

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

    function updatePreviewOnFrame() {
        if (!lastEvent || !isDragging) {
            isMoveScheduled = false;
            return;
        }
        const boardRect = gameBoardElement.getBoundingClientRect();
        const event = lastEvent.touches ? lastEvent.touches[0] : lastEvent;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / boardRect.width * GRID_SIZE);
        const cellY = Math.round(yPos / boardRect.height * GRID_SIZE);

        drawPreview(selectedFigure, cellX, cellY);
        isMoveScheduled = false;
    }

    function handleInteractionMove(event) {
        lastEvent = event;
        if (!isMoveScheduled) {
            isMoveScheduled = true;
            window.requestAnimationFrame(updatePreviewOnFrame);
        }
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
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).map(row => row.reverse());
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        if (!canPlace(figure, placeX, placeY)) return;

        // Figur ZUERST im Datenmodell platzieren
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.category;
        }));

        // DANN prüfen, ob Reihen voll sind und den entsprechenden Sound abspielen
        const clearResult = clearFullLines(); // clearFullLines spielt keinen Sound mehr
        const points = clearResult.points + (figure.points || 0);

        if (isSoundOn) {
            if (clearResult.linesCleared) {
                plopSound.currentTime = 0;
                plopSound.play().catch(e => { });
            } else {
                putSound.currentTime = 0;
                putSound.play().catch(e => { });
            }
        }

        // Restliche Logik bleibt gleich
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

    function toggleSound() {
        isSoundOn = !isSoundOn;
        if (soundToggleButton) {
            soundToggleButton.textContent = isSoundOn ? '🔊' : '🔈';
            soundToggleButton.style.opacity = isSoundOn ? '0.7' : '0.3';
        }
        setCookie('isSoundOn', isSoundOn, 365);
        console.log("Sound ist jetzt:", isSoundOn ? "An" : "Aus");
    }

    function handleKeyPress(e) {
        if (e.key === 'b') {
            const container = document.querySelector('.main-container');
            const footer = document.querySelector('footer');
            if (container) container.classList.toggle('boss-key-hidden');
            if (footer) footer.classList.toggle('boss-key-hidden');
        }
        if (e.key === 'j') {
            generateJokerFigures();
        }
        if (e.key === 's') {
            toggleSound();
        }
        // NEU: Zufälliges Theme bei 't'
        if (e.key === 't') {
            setRandomThemeFromJSON();
        }
    }
    
    // NEU: Funktion für zufälliges Theme aus der themes.json
    function setRandomThemeFromJSON() {
        if (!themes.specials || !themes.themes) {
            console.error("Themes sind nicht geladen.");
            return;
        }

        const imageSet = new Set();

        // Bilder aus "specials" sammeln
        themes.specials.forEach(special => {
            if (special.background) {
                imageSet.add(special.background);
            }
        });

        // Bilder aus "themes" sammeln
        Object.values(themes.themes).forEach(theme => {
            if (theme.background) {
                imageSet.add(theme.background);
            }
        });

        const images = Array.from(imageSet);

        if (images.length === 0) {
            console.warn("Keine Hintergrundbilder in themes.json gefunden.");
            return;
        }

        const randomImage = images[Math.floor(Math.random() * images.length)];
        setBackgroundImage(randomImage);
        console.log(`Zufälliges Theme aus JSON ausgewählt: ${randomImage}`);
    }

    function generateJokerFigures() {
        if (!gameConfig.figures || !gameConfig.figures.joker) return;
        const jokerPool = gameConfig.figures.joker;
        for (let i = 0; i < 3; i++) {
            let figureData = { ...getWeightedRandomFigure(jokerPool) };
            let figure = { ...figureData, form: parseShape(figureData.shape), category: 'joker' };
            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) {
                figure.form = rotateFigure90Degrees(figure.form);
            }
            figuresInSlots[i] = figure;
            drawFigureInSlot(i);
        }
        if (isGameOver()) {
            handleGameOver();
        }
    }

    function getWeightedRandomFigure(pool) {
        const totalWeight = pool.reduce((sum, figure) => sum + (figure.probability || 1), 0);
        let random = Math.random() * totalWeight;
        for (const figure of pool) {
            random -= (figure.probability || 1);
            if (random <= 0) return figure;
        }
        return pool[pool.length - 1];
    }

    function generateNewFigures() {
        console.log("Aktuelle Zonk-Wahrscheinlichkeit:", currentZonkProbability.toFixed(4));
        const { jokerProbability } = gameConfig;
        let isPlaceableSet = false;
        let newFigures = [];
        do {
            newFigures = [];
            for (let i = 0; i < 3; i++) {
                let pool, category;
                const rand = Math.random();
                if (rand < currentZonkProbability) {
                    pool = gameConfig.figures.zonk;
                    category = 'zonk';
                } else if (rand < jokerProbability + currentZonkProbability) {
                    pool = gameConfig.figures.joker;
                    category = 'joker';
                } else {
                    pool = gameConfig.figures.normal;
                    category = 'normal';
                }
                let figureData = { ...getWeightedRandomFigure(pool) };
                let figure = { ...figureData, form: parseShape(figureData.shape), category: category };
                const rotations = Math.floor(Math.random() * 4);
                for (let r = 0; r < rotations; r++) {
                    figure.form = rotateFigure90Degrees(figure.form);
                }
                newFigures.push(figure);
            }
            if (newFigures.some(fig => canFigureBePlacedAnywhere(fig))) {
                isPlaceableSet = true;
            }
        } while (!isPlaceableSet);
        for (let i = 0; i < 3; i++) {
            figuresInSlots[i] = newFigures[i];
            drawFigureInSlot(i);
        }
        const increment = gameConfig.zonkProbabilityIncrementPerRound || 0;
        const max = gameConfig.zonkProbabilityMax || 1;
        currentZonkProbability = Math.min(currentZonkProbability + increment, max);
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
            for (let i = 0; i < 4; i++) {
                for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                    for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                        if (canPlace({ form: currentForm }, x, y)) return false;
                    }
                }
                currentForm = rotateFigure90Degrees(currentForm);
            }
            return true;
        });
    }

    function canFigureBePlacedAnywhere(figure) {
        if (!figure) return false;
        let currentForm = figure.form;
        for (let i = 0; i < 4; i++) {
            for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                    if (canPlace({ form: currentForm }, x, y)) {
                        return true;
                    }
                }
            }
            currentForm = rotateFigure90Degrees(currentForm);
        }
        return false;
    }

    function clearFullLines() {
        let rows = [], cols = [];
        for (let y = 0; y < GRID_SIZE; y++) if (gameBoard[y].every(cell => cell !== 0)) rows.push(y);
        for (let x = 0; x < GRID_SIZE; x++) if (gameBoard.every(row => row[x] !== 0)) cols.push(x);

        const linesCleared = rows.length > 0 || cols.length > 0;

        // Die Sound-Logik wurde von hier entfernt

        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        
        // Wir geben jetzt ein Objekt zurück, das beide Informationen enthält
        return {
            points: Math.pow(rows.length + cols.length, 2) * 100,
            linesCleared: linesCleared
        };
    }

    function handleGameOver() {
        if (isSoundOn) {
            overSound.currentTime = 0;
            overSound.play().catch(e => { });
        }
        gameBoardElement.classList.add('crumble');
        let isNewHighscore = score > highscore;
        if (isNewHighscore) {
            highscore = score;
            setCookie('highscore', highscore, 365);
        }
        setTimeout(() => {
            const allCells = gameBoardElement.querySelectorAll('.cell.occupied');
            allCells.forEach(cell => {
                cell.className = 'cell';
            });
            gameBoardElement.classList.remove('crumble');
            if (isNewHighscore) {
                highscoreElement.textContent = highscore;
                highscoreElement.classList.add('pulsate');
                setTimeout(initializeGame, 1800);
            } else {
                initializeGame();
            }
        }, 1600);
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

    function drawPreview(figure, centerX, centerY) {
        currentPreviewCells.forEach(cell => {
            cell.classList.remove('preview', 'invalid');
            if (!cell.classList.contains('occupied')) {
                cell.classList.remove('color-normal', 'color-joker', 'color-zonk');
            }
        });
        currentPreviewCells = [];
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
    document.addEventListener('keydown', handleKeyPress);

    async function startGame() {
        await loadThemes(); // Zuerst die Themes laden
        applyTheme();       // Dann das Theme anwenden (Special oder Wetter)
        initializeGame();   // Dann das restliche Spiel initialisieren
    }

    startGame(); // Das Spiel starten
});