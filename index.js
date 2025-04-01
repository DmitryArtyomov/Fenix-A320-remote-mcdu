const parseMcduXml = (string) => {
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

const isModifier = (str) => str.toLowerCase() === str && str !== str.toUpperCase();
const modifierClass = {
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
const modifierClasses = (str, currentClasses) => {
    const classes = Array.from(currentClasses);
    [...str].map((char) => modifierClass[char]).filter(c => c).forEach((klass) => {
        const idx = (klass == 'small' || klass == 'large') ? 0 : 1;
        classes[idx] = klass;
    });
    return classes;
}

const renderLine = (line) => {
    let classes = [null, null];
    const content = line.split(/([a-z]+)/).filter((s) => s.length).map((part) => {
        if (isModifier(part)) {
            classes = modifierClasses(part, classes);
            return `<i class="${classes.filter(c => c).join(' ')}"></i>`;
        } else {
            return `<span>${escapeHtmlEntities(part)}</span>`;
        }
    }).join('');
    return `<div class="line">${content}</div>`;
};
const renderLines = (lines) => {
    const contents = lines.map(renderLine).join("\n");
    document.getElementById('mcdu-content').innerHTML = contents;
};

const escapeHtmlEntities = (string) => {
    const replacer = (match) => {
        if (match === "&") return "&amp;";
        else if (match === "<") return "&lt;";
        else if (match === ">") return "&gt;";
        else if (match === "'") return "&apos;";
        else if (match === '"') return "&quot;";
    };

    return string.replace(/[&<>'"]/g, replacer);
}

let socket, resizeObserver;

const sendMessage = (message) => {
    socket.send(JSON.stringify(message));
}

const displayChanged = (ref) => {
    const parsedLines = parseMcduXml(ref);
    renderLines(parsedLines);
}

const messageReceived = (message) => {
    if (message.type == 'data' && message.id == '1' && message.payload?.data?.dataRefs?.name == 'aircraft.mcdu1.display') {
        displayChanged(message.payload.data.dataRefs.value);
    }
}

const connectionSettings = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const ip = queryParams.get('ip') || 'localhost';
    const port = queryParams.get('port') || '8083';
    return { ip: ip, port: port };
}

const initializeWebsocket = () => {
    const settings = connectionSettings();
    socket = new WebSocket(`ws://${settings.ip}:${settings.port}/graphql`, 'graphql-ws');
    socket.addEventListener("message", (event) => {
        messageReceived(JSON.parse(event.data));
    })
    socket.addEventListener("open", (event) => {
        sendMessage({
            type: "connection_init",
            payload: {},
        });
        sendMessage({
            id: "1",
            type: "start",
            payload: {
                variables: {
                    names: ["aircraft.mcdu1.display"]
                },
                extensions: {},
                operationName: "OnDataRefChanged",
                query: "subscription OnDataRefChanged($names: [String!]!) {\n  dataRefs(names: $names) {\n    name\n    value\n    __typename\n  }\n}"
            }
        });
    });
}

const initializeObserver = () => {
    resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            windowResized(entry);
        }
    });
    const container = document.getElementById('container');
    resizeObserver.observe(container);
}

const windowResized = (entry) => {
    const width = entry.contentRect.width;
    const height = entry.contentRect.height;
    const maxSizeByHeight = height / 14.0;
    const maxSizeByWidth = width / 14.85;
    const fontSize = Math.min(maxSizeByWidth, maxSizeByHeight);
    const fontSizeRounded = Math.floor(fontSize);
    const mcduEl = document.getElementById('mcdu-content');
    mcduEl.style.setProperty("--font-size", `${fontSizeRounded}px`);
    const excessWidth = width - fontSizeRounded * 14.85;
    const letterSpacing = Math.min(Math.floor(excessWidth / 24.0), 5);
    mcduEl.style.setProperty("--letter-spacing", `${letterSpacing}px`);
}

document.addEventListener('DOMContentLoaded',function() {
    initializeWebsocket();
    initializeObserver();
})

