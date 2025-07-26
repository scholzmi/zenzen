document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements: Speichert alle wichtigen HTML-Elemente für den schnellen Zugriff.
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');
    const titleElement = document.querySelector('.block-title');

    // =======================================================
    // GAME STATE - Alle wichtigen Variablen, die den Spielzustand steuern.
    // =======================================================
    let gameBoard = []; // Ein 2D-Array (9x9), das das Spielfeld repräsentiert. 0 = leer.
    let score = 0; // Aktueller Punktestand der laufenden Runde.
    let highscore = 0; // Höchster erreichter Punktestand, wird aus einem Cookie geladen.
    let figuresInSlots = [null, null, null]; // Array, das die drei aktuell verfügbaren Spielfiguren enthält.
    let selectedFigure = null; // Die Figur, die der Spieler gerade per Drag & Drop bewegt.
    let selectedSlotIndex = -1; // Der Index (0, 1, oder 2) des Slots, aus dem die Figur genommen wurde.
    const TOUCH_Y_OFFSET = -30; // Ein Wert in Pixeln, um die Figur beim Ziehen über dem Finger anzuzeigen.
    let gameConfig = {}; // Ein Objekt, das nach dem Laden die gesamte config.json enthält.
    const GRID_SIZE = 9; // Definiert die Größe des Spielfelds (9x9).
    let isDragging = false; // Ein "Flag", das anzeigt, ob gerade eine Figur gezogen wird.
    let lastTap = 0; // Zeitstempel des letzten Taps, um Doppeltaps zu erkennen (zum Drehen der Figuren).
    const doubleTapDelay = 300; // Zeit in Millisekunden, innerhalb der ein Doppeltap erkannt wird.
    let isMoveScheduled = false; // Verhindert, dass die Vorschau-Funktion zu oft aufgerufen wird.
    let lastEvent = null; // Speichert das letzte Maus- oder Touch-Ereignis für die Vorschau.
    let currentPreviewCells = []; // Speichert die Zellen, die gerade als Vorschau eingefärbt sind.
    let currentZonkProbability = 0; // Die aktuelle Wahrscheinlichkeit, eine "Zonk"-Figur zu erhalten. Steigt mit jeder Runde.
    let specialEvents = {}; // Speichert nach dem Laden die special_events.json.
    let imageList = []; // Speichert nach dem Laden die Liste der normalen Hintergrundbilder aus bilder.json.
    let currentThemeIndex = -1; // Der Index des aktuell angezeigten Bildes aus der imageList.
    let titleTapCount = 0; // Zählt die Klicks auf den Titel (für den Joker-Cheat).
    let titleTapTimer = null; // Timer, um den titleTapCount zurückzusetzen.
    let themeErrorCounter = 0; // Zählt, wie viele Bilder hintereinander nicht geladen werden konnten.
    
    // Variablen für Gesten auf dem Spielbrett (z.B. Transparenz ändern)
    let boardTapCount = 0;
    let boardTapTimer = null;
    let boardTapHoldTimer = null;
    let isAdjustingOpacity = false;
    let startY = 0;
    let startOpacity = 0;

    // =======================================================
    // THEME-FUNKTIONEN
    // =======================================================

    /**
     * Lädt externe Konfigurationsdateien (Events und Bilderliste).
     */
    async function loadResources() {
        try {
            // Lädt die Special-Events-Konfiguration. Der Zeitstempel verhindert, dass der Browser eine alte Version aus dem Cache nimmt.
            const eventsResponse = await fetch('special_events.json?v=' + new Date().getTime());
            if (!eventsResponse.ok) throw new Error('special_events.json konnte nicht geladen werden.');
            specialEvents = await eventsResponse.json();
            console.log('Special Events erfolgreich geladen:', specialEvents);

            // Lädt die Liste der normalen Hintergrundbilder.
            const imagesResponse = await fetch('bilder.json?v=' + new Date().getTime());
            if (!imagesResponse.ok) throw new Error('bilder.json konnte nicht geladen werden.');
            imageList = await imagesResponse.json();
            imageList.sort(); // Sortiert die Bilder alphabetisch für eine konsistente Reihenfolge.
            console.log('Bilderliste erfolgreich geladen und sortiert:', imageList);

        } catch (error) {
            console.error('Fehler beim Laden der Ressourcen:', error);
        }
    }

    /**
     * Setzt das Hintergrundbild des Spiels.
     * @param {string} imageUrl - Der Pfad zum Bild, das geladen werden soll.
     */
    function setBackgroundImage(imageUrl) {
        const fallbackUrl = 'bg.png'; // Ein Standardbild, falls alles andere fehlschlägt.
        const finalImageUrl = imageUrl || fallbackUrl;

        const img = new Image();
        img.src = finalImageUrl;

        // Wenn das Bild erfolgreich geladen wurde...
        img.onload = () => {
            themeErrorCounter = 0; // Fehlerzähler zurücksetzen.
            console.log(`Hintergrund erfolgreich geladen: ${finalImageUrl}`);
            document.body.style.setProperty('--background-image', `url('${finalImageUrl}')`);
            updateThemeFromImage(finalImageUrl); // Farben aus dem Bild extrahieren.
            setCookie('theme', finalImageUrl, 365); // Das gewählte Theme für zukünftige Besuche speichern.
        };

        // Wenn das Bild nicht geladen werden konnte...
        img.onerror = () => {
            themeErrorCounter++;
            // Sicherheitsnetz, um eine Endlosschleife zu verhindern, falls KEIN Bild aus der Liste verfügbar ist.
            if (imageList.length > 0 && themeErrorCounter >= imageList.length) {
                console.error("Alle Bilder in der Liste konnten nicht geladen werden. Lade finales Fallback-Bild.");
                document.body.style.setProperty('--background-image', `url('${fallbackUrl}')`);
                updateThemeFromImage(fallbackUrl);
                themeErrorCounter = 0;
                return;
            }

            console.warn(`Hintergrund '${finalImageUrl}' nicht gefunden. Lade nächstes Bild.`);
            
            // Finde den Index des fehlerhaften Bildes, um konsistent weiterzuschalten.
            let failedIndex = imageList.indexOf(finalImageUrl);
            if (failedIndex === -1) {
                failedIndex = currentThemeIndex;
            }

            // Schalte zum nächsten Bild in der Liste und versuche es erneut.
            currentThemeIndex = (failedIndex + 1) % imageList.length;
            const nextImage = imageList[currentThemeIndex];
            setBackgroundImage(nextImage);
        };
    }
    
    /**
     * Prüft, ob ein Special-Event aktiv ist, basierend auf MM-DD Logik.
     * Kann auch Zeiträume über den Jahreswechsel (z.B. 12-29 bis 01-03) korrekt verarbeiten.
     * @returns {string|null} Die URL zum Hintergrundbild des Events oder null.
     */
    function checkForSpecialTheme() {
        if (!specialEvents.specials || !Array.isArray(specialEvents.specials)) {
            return null;
        }

        const now = new Date();
        // Formatiere das aktuelle Datum als "MM-DD" String für den Vergleich.
        // `getMonth()` ist 0-basiert, daher +1. `padStart` sorgt für die führende Null.
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = String(now.getDate()).padStart(2, '0');
        const currentDateStr = `${currentMonth}-${currentDay}`;

        for (const special of specialEvents.specials) {
            const { start, end, background, name } = special;
            
            // Fall 1: Normaler Zeitraum innerhalb eines Jahres (z.B. 10-20 bis 11-03)
            if (start <= end) {
                if (currentDateStr >= start && currentDateStr <= end) {
                    console.log(`Special Event "${name}" ist aktiv!`);
                    return background;
                }
            } 
            // Fall 2: Zeitraum über den Jahreswechsel (z.B. 12-29 bis 01-03)
            else {
                // Bedingung: (aktuelles Datum ist >= Startdatum) ODER (aktuelles Datum ist <= Enddatum)
                if (currentDateStr >= start || currentDateStr <= end) {
                    console.log(`Special Event "${name}" (Jahreswechsel) ist aktiv!`);
                    return background;
                }
            }
        }
        
        return null; // Kein Special-Event aktiv
    }

    /**
     * Wendet das passende Theme an (Special-Event, Cookie oder das nächste aus der Liste).
     * @param {boolean} [forceNext=false] - Wenn true, wird das nächste Theme aus der Liste geladen und die Event/Cookie-Prüfung übersprungen.
     */
    function applyTheme(forceNext = false) {
        // Prüfe auf Special-Event, aber nur, wenn nicht explizit das nächste Theme erzwungen wird.
        const specialThemeUrl = checkForSpecialTheme();
        if (specialThemeUrl && !forceNext) {
            setBackgroundImage(specialThemeUrl);
            console.log("Special Event gefunden!");
            return;
        }

        // Prüfe auf ein gespeichertes Theme im Cookie.
        const savedTheme = getCookie('theme');
        if (savedTheme && !forceNext) {
            const savedThemeIndex = imageList.indexOf(savedTheme);
            if (savedThemeIndex !== -1) {
                currentThemeIndex = savedThemeIndex;
                setBackgroundImage(savedTheme);
                console.log(`Gespeichertes Theme aus Cookie geladen: ${savedTheme}`);
                return;
            }
        }

        // Wenn kein Event oder Cookie zutrifft (oder forceNext=true), lade das nächste Bild.
        if (imageList.length > 0) {
            currentThemeIndex = (currentThemeIndex + 1) % imageList.length; // Modulo für den Endlos-Zyklus.
            const nextImage = imageList[currentThemeIndex];
            setBackgroundImage(nextImage);
            console.log(`Neues Theme gesetzt: ${nextImage}`);
        } else {
            setBackgroundImage(null); // Fallback, wenn gar keine Bilder konfiguriert sind.
        }
    }

    // =======================================================
    // SPIEL-INITIALISIERUNG UND RESTLICHE LOGIK
    // =======================================================

    /**
     * Startet oder resettet das Spiel.
     */
    async function initializeGame() {
        // Animationen und Klassen zurücksetzen.
        highscoreElement.classList.remove('pulsate', 'new-highscore-animation');
        gameBoardElement.classList.remove('crumble');

        // Lade die config.json, falls sie noch nicht geladen ist.
        if (Object.keys(gameConfig).length === 0) {
            const configLoaded = await loadConfiguration();
            if (!configLoaded) {
                document.body.innerHTML = "<h1>Fehler</h1><p>config.json ...</p>";
                return;
            }
        }
        // Setze die Zonk-Wahrscheinlichkeit auf den Startwert aus der Konfiguration.
        currentZonkProbability = gameConfig.zonkProbability || 0;

        // Prüft, ob sich die Spielversion geändert hat. Wenn ja, wird der Highscore zurückgesetzt.
        const serverVersion = gameConfig.gameVersion || "1.0";
        const localVersion = getCookie('gameVersion');
        if (serverVersion !== localVersion) {
            setCookie('highscore', '0', 365);
            setCookie('gameVersion', serverVersion, 365);
        }

        // Lade Highscore aus Cookie und setze aktuellen Score auf 0.
        highscore = parseInt(getCookie('highscore') || '0', 10);
        highscoreElement.textContent = highscore;
        score = 0;
        scoreElement.textContent = score;

        // Erstelle das Spielfeld und die ersten drei Figuren.
        createGameBoard();
        generateNewFigures();
    }

    /**
     * Lädt und verarbeitet die zentrale config.json.
     */
    async function loadConfiguration() {
        try {
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`Network response was not ok`);
            gameConfig = await response.json();
            // Setzt die Versions-Infos im Footer.
            if (versionInfoElement) versionInfoElement.textContent = gameConfig.version || "?.??";
            if (lastModificationElement) lastModificationElement.textContent = gameConfig.lastModification || "N/A";
            // Stellt sicher, dass die Figuren-Konfiguration in der JSON-Datei korrekt ist.
            if (!gameConfig.figures || !gameConfig.figures.normal || !gameConfig.figures.zonk || !gameConfig.figures.joker) {
                throw new Error("Figurenpools in config.json sind nicht korrekt definiert.");
            }
            return true;
        } catch (error) { console.error('Error loading config:', error); return false; }
    }

    /**
     * Erstellt das 9x9 Spielfeld-Grid im HTML.
     */
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
                cell.style.setProperty('--delay', Math.random()); // Für die "crumble"-Animation
                gameBoardElement.appendChild(cell);
            }
        }
        // Passt die Größe der Blöcke in den Vorschau-Slots an die Spielfeldgröße an.
        document.documentElement.style.setProperty('--figure-block-size', `${Math.max(10, cellSize / 2.5)}px`);
    }

    /**
     * Wandelt eine RGB-Farbe in HSL um.
     */
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

    /**
     * Extrahiert eine Farbpalette aus dem Hintergrundbild und passt die CSS-Variablen an.
     * @param {string} imageUrl - Die URL des Bildes, aus dem die Farben extrahiert werden.
     */
    function updateThemeFromImage(imageUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = function () {
            const colorThief = new ColorThief();
            let palette = colorThief.getPalette(img, 8); // Extrahiert 8 Hauptfarben.

            function getColorBrightness(rgb) {
                return Math.sqrt(0.299 * (rgb[0] * rgb[0]) + 0.587 * (rgb[1] * rgb[1]) + 0.114 * (rgb[2] * rgb[2]));
            }

            // Sortiert die Palette von der dunkelsten zur hellsten Farbe.
            palette.sort((a, b) => getColorBrightness(a) - getColorBrightness(b));
            
            // Weist die sortierten Farben den verschiedenen UI-Elementen zu.
            const textColor = palette[0];
            const zonkColor = palette[1];
            const figureNormalColor = palette[2];
            const jokerColor = palette[3];
            const borderColor = palette[4];
            const accentColor = palette[5];
            const mainBgColor = palette[7];

            // Wandelt die RGB-Farben in HSL um, um sie in den CSS-Variablen zu verwenden.
            const [bgH, bgS, bgL] = rgbToHsl(mainBgColor[0], mainBgColor[1], mainBgColor[2]),
                [textH, textS, textL] = rgbToHsl(textColor[0], textColor[1], textColor[2]),
                [borderH, borderS, borderL] = rgbToHsl(borderColor[0], borderColor[1], borderColor[2]),
                [figH, figS, figL] = rgbToHsl(figureNormalColor[0], figureNormalColor[1], figureNormalColor[2]),
                [jokerH, jokerS, jokerL] = rgbToHsl(jokerColor[0], jokerColor[1], jokerColor[2]),
                [zonkH, zonkS, zonkL] = rgbToHsl(zonkColor[0], zonkColor[1], zonkColor[2]),
                [accentH, accentS, accentL] = rgbToHsl(accentColor[0], accentColor[1], accentColor[2]);

            // Setzt die CSS-Variablen im :root-Element, sodass das gesamte UI sich anpasst.
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

    /**
     * Weist allen interaktiven Elementen ihre Event-Listener zu.
     */
    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });

        if (titleElement) {
            titleElement.addEventListener('click', handleTitleTap);
        }

        gameBoardElement.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
        gameBoardElement.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
        gameBoardElement.addEventListener('touchend', handleBoardTouchEnd);
    }
    
    // ... (restlicher Code ist großteils selbsterklärend durch Funktions- und Variablennamen)
    // ... aber ich habe noch ein paar Schlüsselstellen kommentiert.

    /**
     * Behandelt Tastatureingaben für Cheats und Steuerungen.
     * @param {KeyboardEvent} e - Das Key-Press-Event.
     */
    function handleKeyPress(e) {
        // "Boss-Key": Versteckt das Spiel.
        if (e.key === 'b') {
            const container = document.querySelector('.main-container');
            const footer = document.querySelector('footer');
            if (container) container.classList.toggle('boss-key-hidden');
            if (footer) footer.classList.toggle('boss-key-hidden');
        }
        // Cheat: Generiert nur Joker-Figuren.
        if (e.key === 'j') {
            generateJokerFigures();
        }
        // Theme wechseln.
        if (e.key === 't') {
            // Blockiert den Wechsel, wenn ein Special-Event aktiv ist.
            if (checkForSpecialTheme()) {
                console.log("Theme-Wechsel per 't' blockiert: Special-Event ist aktiv.");
                return;
            }
            applyTheme(true); // `true` erzwingt das nächste Theme aus der Liste.
        }
    }
    
    /**
     * Generiert drei neue Spielfiguren basierend auf den Wahrscheinlichkeiten aus der config.json.
     * Stellt sicher, dass immer mindestens eine der drei neuen Figuren auf das Brett passt.
     */
    function generateNewFigures() {
        console.log("Aktuelle Zonk-Wahrscheinlichkeit:", currentZonkProbability.toFixed(4));
        const { jokerProbability } = gameConfig;
        let isPlaceableSet = false;
        let newFigures = [];
        
        // Diese Schleife läuft so lange, bis ein Set an Figuren generiert wurde,
        // bei dem mindestens eine Figur auf das aktuelle Spielfeld passt.
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
            // Prüft, ob eine der gerade erstellten Figuren irgendwo platziert werden kann.
            if (newFigures.some(fig => canFigureBePlacedAnywhere(fig))) {
                isPlaceableSet = true;
            }
        } while (!isPlaceableSet);

        // Weist die gültigen neuen Figuren den Slots zu.
        for (let i = 0; i < 3; i++) {
            figuresInSlots[i] = newFigures[i];
            drawFigureInSlot(i);
        }

        // Erhöhe die Zonk-Wahrscheinlichkeit für die nächste Runde.
        const increment = gameConfig.zonkProbabilityIncrementPerRound || 0;
        const max = gameConfig.zonkProbabilityMax || 1;
        currentZonkProbability = Math.min(currentZonkProbability + increment, max);
        
        drawGameBoard();
        if (isGameOver()) {
            handleGameOver();
        }
    }
    
    /**
     * Prüft, ob das Spiel vorbei ist (keine der verfügbaren Figuren passt mehr aufs Brett).
     * @returns {boolean} True, wenn das Spiel vorbei ist, sonst false.
     */
    function isGameOver() {
        // `every` prüft, ob die Bedingung für ALLE Elemente im Array gilt.
        return figuresInSlots.every(figure => {
            if (!figure) return true; // Ein leerer Slot bedeutet, dass das Spiel nicht vorbei sein kann.
            let currentForm = figure.form;
            // Prüft für jede der 4 möglichen Rotationen...
            for (let i = 0; i < 4; i++) {
                // ...und für jede mögliche Position auf dem Spielfeld...
                for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                    for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                        // ...ob die Figur platziert werden kann.
                        if (canPlace({ form: currentForm }, x, y)) {
                            return false; // Wenn eine Platzierung gefunden wird, ist das Spiel für diese Figur NICHT vorbei.
                        }
                    }
                }
                currentForm = rotateFigure90Degrees(currentForm);
            }
            return true; // Wenn nach allen Rotationen und Positionen kein Platz gefunden wurde, ist es für diese Figur vorbei.
        });
    }

    /**
     * Löst das Game-Over-Szenario aus (Animation und Neustart).
     */
    function handleGameOver() {
        gameBoardElement.classList.add('crumble'); // Startet die Zerbrösel-Animation.
        setTimeout(() => {
            const allCells = gameBoardElement.querySelectorAll('.cell.occupied');
            allCells.forEach(cell => {
                cell.className = 'cell'; // Setzt alle Zellen zurück.
            });
            gameBoardElement.classList.remove('crumble');
            initializeGame(); // Startet ein neues Spiel.
        }, 1600); // Die Wartezeit muss zur Dauer der CSS-Animation passen.
    }
    
    /**
     * Konvertiert die Koordinaten-Form aus der config.json in eine 2D-Matrix.
     * @param {number[]} shapeCoords - Array mit Zahlen (z.B. [1, 2, 6, 7] für einen 2x2 Block).
     * @returns {Array<Array<number>>} Eine zugeschnittene 2D-Matrix (z.B. [[1,1],[1,1]]).
     */
    function parseShape(shapeCoords) {
        let tempMatrix = Array.from({ length: 5 }, () => Array(5).fill(0));
        let minRow = 5, maxRow = -1, minCol = 5, maxCol = -1;
        
        // Füllt eine 5x5 Matrix basierend auf den Koordinaten.
        shapeCoords.forEach(coord => {
            const row = Math.floor((coord - 1) / 5);
            const col = (coord - 1) % 5;
            tempMatrix[row][col] = 1;
            // Findet die tatsächlichen Ränder der Figur.
            minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
        });
        
        // Schneidet die Matrix auf die exakte Größe der Figur zu.
        return tempMatrix.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1));
    }
    
    /**
     * Hilfsfunktionen für Cookies zum Speichern von Highscore, Theme etc.
     */
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

    // =======================================================
    // START DES SPIELS
    // =======================================================
    
    /**
     * Startet die gesamte Anwendung.
     */
    async function startGame() {
        assignEventListeners(); // Zuerst die Event-Listener zuweisen.
        document.addEventListener('keydown', handleKeyPress);

        await loadResources(); // Dann die externen Konfigurationen laden.
        applyTheme();          // Das initiale Theme anwenden.
        initializeGame();      // Das eigentliche Spiel starten.
    }

    startGame();
});