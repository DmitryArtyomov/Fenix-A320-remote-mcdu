class MCDU {
    #lines = 14;
    #columns = 24;
    #charSizeWidthRatio = 14.85;
    #maxLetterSpacing = 5;

    constructor(remoteIp = 'localhost', remotePort = '8083', mcduIndex = '1') {
        const remoteAddress = `${remoteIp}:${remotePort}`;
        this.mcduIndex = mcduIndex;

        this.initializeObserver();
        this.initializeWebsocket(remoteAddress);
    }

    modifierClass = {
        "s": "small",
        "l": "large",
        "a": "amber",
        "w": "white",
        "c": "cyan",
        "g": "green",
        "m": "magenta",
        "r": "red",
        "y": "yellow"
    };

    parseXML(string) {
        const xml = (new DOMParser).parseFromString(string, "text/xml");
        const titles = xml.getElementsByTagName("title");
        const lines = xml.getElementsByTagName("line");
        const scratchpad = xml.getElementsByTagName("scratchpad");
        const textFunc = (str) => (str.textContent == null) ? '' : str.textContent;
        return [
            ...Array.from(titles).map(textFunc),
            ...Array.from(lines).map(textFunc),
            ...Array.from(scratchpad).map(textFunc)
        ];
    }

    isModifier(str) {
        return str.toLowerCase() === str && str !== str.toUpperCase();
    }

    modifyClasses(str, currentClasses) {
        [...str].map((char) => this.modifierClass[char]).filter(c => c).forEach((klass) => {
            const idx = (klass == 'small' || klass == 'large') ? 0 : 1;
            currentClasses[idx] = klass;
        });
    }

    renderLine(line) {
        const classes = [null, null];
        const content = line.split(/([a-z]+)/).filter((s) => s.length).map((part) => {
            if (this.isModifier(part)) {
                this.modifyClasses(part, classes);
                return `<i class="${classes.filter(c => c).join(' ')}"></i>`;
            } else {
                return `<span>${this.escapeHtmlEntities(part)}</span>`;
            }
        }).join('');
        return `<div class="line">${content}</div>`;
    };
    
    renderScreen(lines) {
        const contents = lines.map((line) => this.renderLine(line)).join("\n");
        document.getElementById('mcdu-content').innerHTML = contents;
    };

    escapeHtmlEntities(string) {
        const replacer = (match) => {
            if (match === "&") return "&amp;";
            else if (match === "<") return "&lt;";
            else if (match === ">") return "&gt;";
            else if (match === "'") return "&apos;";
            else if (match === '"') return "&quot;";
        };
    
        return string.replace(/[&<>'"]/g, replacer);
    }
    

    showCustomMessage(text) {
        const emptyLine = ' '.repeat(this.#columns);
        const lines = text.split('\n').map((s) => s.trim()).map((line) => {
            const modifiers = (line.match(/[a-z]/g) || []).length;
            const textLength = line.length - modifiers;
            const leftPadding = Math.floor((this.#columns - textLength) / 2);
            const rightPadding = this.#columns - textLength - leftPadding;
            return `${' '.repeat(leftPadding)}${line}${' '.repeat(rightPadding)}`
        });

        const topPadding = Math.floor((this.#lines - lines.length) / 2);
        const bottomPadding = this.#lines - lines.length - topPadding;
        const messageLines = [
            ...Array(topPadding).fill(emptyLine),
            ...lines,
            ...Array(bottomPadding).fill(emptyLine)
        ];
        this.renderScreen(messageLines);
    }

    sendSocketMessage(message) {
        this.socket.send(JSON.stringify(message));
    }

    messageReceived(message) {
        if (message.type == 'data' && message.id == '1' && message.payload?.data?.dataRefs?.name == `aircraft.mcdu${this.mcduIndex}.display`) {
            const value = message.payload.data.dataRefs.value;
            const parsedLines = this.parseXML(value);
            this.renderScreen(parsedLines);
        }
    }

    initializeWebsocket(remoteAddress) {
        this.showCustomMessage(`CONNECTING\nsTO\nsm${remoteAddress}`);
        this.socket = new WebSocket(`ws://${remoteAddress}/graphql`, 'graphql-ws');
        this.socket.addEventListener("message", (event) => {
            this.messageReceived(JSON.parse(event.data));
        });
        this.socket.addEventListener("error", (event) => {
            this.socket.close();
        });
        this.socket.addEventListener("close", (event) => {
            this.showCustomMessage('DISCONNECTED\n\nsmATTEMPTING RECONNECT\nsmIN g1 mSECOND');
            setTimeout(() => {
                this.initializeWebsocket(remoteAddress);
            }, 1000);
        });
        this.socket.addEventListener("open", (event) => {
            this.sendSocketMessage({
                type: "connection_init",
                payload: {},
            });
            this.sendSocketMessage({
                id: "1",
                type: "start",
                payload: {
                    variables: {
                        names: [`aircraft.mcdu${this.mcduIndex}.display`]
                    },
                    extensions: {},
                    operationName: "OnDataRefChanged",
                    query: "subscription OnDataRefChanged($names: [String!]!) {\n  dataRefs(names: $names) {\n    name\n    value\n    __typename\n  }\n}"
                }
            });
        });
    }

    initializeObserver() {
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.containerResized(entry);
            }
        });
        const container = document.getElementById('container');
        this.resizeObserver.observe(container);
    }

    containerResized(entry) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        const maxSizeByHeight = height / this.#lines;
        const maxSizeByWidth = width / this.#charSizeWidthRatio;
        const fontSize = Math.min(maxSizeByWidth, maxSizeByHeight);
        const fontSizeRounded = Math.floor(fontSize);

        const mcduEl = document.getElementById('mcdu-content');
        mcduEl.style.setProperty("--font-size", `${fontSizeRounded}px`);

        const excessWidth = width - fontSizeRounded * this.#charSizeWidthRatio;
        const letterSpacing = Math.min(Math.floor(excessWidth / this.#columns), this.#maxLetterSpacing);
        mcduEl.style.setProperty("--letter-spacing", `${letterSpacing}px`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const queryParams = new URLSearchParams(window.location.search);
    const ip = queryParams.get('ip') || 'localhost';
    const port = queryParams.get('port') || '8083';
    const mcduIndex = queryParams.get('mcdu') || '1';
    window.mcdu = new MCDU(ip, port, mcduIndex);
})
