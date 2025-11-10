// ==UserScript==
// @name         LSS Tägliche Bau- und Lehrgangsübersicht
// @namespace    https://www.leitstellenspiel.de/
// @version      1.0
// @description  Alle heute fertig werdenden Gebäude-Erweiterungen, Lagerräume, Spezialisierungen und Lehrgänge auf einen Blick.
// @author       BlueLightWarrior
// @match        https://www.leitstellenspiel.de/*
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @resource     icon https://github.com/BlueLightWarrior/LSS-Scripte/raw/main/LSS%20T%C3%A4gliche%20Bau%C3%BCbersicht/Icon.png
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = "https://www.leitstellenspiel.de";
    const today = new Date().toDateString();

    function createMenuItem() {
        const triggerLi = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";

        const triggerImg = document.createElement("img");
        triggerImg.src = GM_getResourceURL('icon');
        triggerImg.width = 24;
        triggerImg.height = 24;
        triggerImg.style.verticalAlign = "middle";
        triggerImg.style.marginRight = "10px";

        a.appendChild(triggerImg);
        a.appendChild(document.createTextNode("Bau- und Lehrgangsübersicht"));
        a.addEventListener("click", (e) => {
            e.preventDefault();
            showDailyOverviewModal();
        });

        triggerLi.appendChild(a);

        document.querySelector('#menu_profile + .dropdown-menu > li.divider')
            ?.before(triggerLi);
    }

    async function getJSON(url) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json();
    }

    async function getHTML(url) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.text();
    }

    function formatDate(dt) {
        return new Date(dt).toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    async function showDailyOverviewModal() {
        try {
            const [userinfo, buildings] = await Promise.all([
                getJSON(`${BASE_URL}/api/userinfo`),
                getJSON(`${BASE_URL}/api/buildings`)
            ]);

            const profileId = userinfo.user_id;
            const schoolingsHTML = await getHTML(`${BASE_URL}/schoolings`);
            const parser = new DOMParser();
            const doc = parser.parseFromString(schoolingsHTML, "text/html");

            const schoolings = [];
            doc.querySelectorAll("table.table-striped tbody tr").forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length < 3) return;
                const lehrgangName = cols[0].textContent.trim();
                const sortVal = cols[1].getAttribute("sortvalue");
                const endDatum = sortVal ? new Date(Date.now() + parseInt(sortVal) * 1000) : null;
                const leiter = cols[2].textContent.trim();
                const link = cols[0].querySelector("a");
                const id = link?.href.split("/").pop();
                const url = link?.href;
                if (id && url) {
                    schoolings.push({ name: lehrgangName, end: endDatum, leiter, url, id });
                }
            });

            let html = `<div class="lss-header">📅 Heutige Fertigstellungen (${new Date().toLocaleDateString("de-DE")})</div>`;

            const sections = [
                { key: "extensions", icon: "🏢", title: "Gebäude-Erweiterungen", emptyText: "Heute werden keine Gebäude-Erweiterungen fertig." },
                { key: "storage_upgrades", icon: "📦", title: "Lagerräume", emptyText: "Heute werden keine Lagerräume fertig." },
                { key: "specialization", icon: "🔧", title: "Spezialisierungen", emptyText: "Heute werden keine Spezialisierungen fertig." },
                { key: "schoolings", icon: "🎓", title: "Lehrgänge", emptyText: "Heute enden keine Lehrgänge." }
            ];

            // Gebäude-Bereiche (mit Sortierung nach Uhrzeit)
            for (const sec of sections.slice(0, 3)) {
                html += `<h3>${sec.icon} ${sec.title}</h3><ul>`;
                let itemsToShow = [];

                buildings.forEach(b => {
                    if (sec.key === "specialization") {
                        const sp = b.specialization;
                        if (sp?.available_at && new Date(sp.available_at).toDateString() === today) {
                            itemsToShow.push({ name: sp.caption, building: b.caption, date: new Date(sp.available_at) });
                        }
                    } else {
                        b[sec.key]?.forEach(item => {
                            if (item.available_at && new Date(item.available_at).toDateString() === today) {
                                const label = item.caption || item.upgrade_type;
                                itemsToShow.push({ name: label, building: b.caption, date: new Date(item.available_at) });
                            }
                        });
                    }
                });

                itemsToShow.sort((a, b) => a.date - b.date);

                if (itemsToShow.length === 0) {
                    html += `<li>${sec.emptyText}</li>`;
                } else {
                    itemsToShow.forEach(it => {
                        html += `<li><strong>${it.building}</strong>: ${it.name}<br><span class="date">Fertig am ${formatDate(it.date)}</span></li>`;
                    });
                }

                html += "</ul>";
            }

            // Lehrgänge (mit Sortierung)
            const schoolingSec = sections[3];
            html += `<h3>${schoolingSec.icon} ${schoolingSec.title}</h3><ul>`;
            let schoolingsToday = [];

            for (const s of schoolings) {
                if (!s.end || s.end.toDateString() !== today) continue;
                const detailHTML = await getHTML(s.url);
                const detailDoc = parser.parseFromString(detailHTML, "text/html");
                const rows = detailDoc.querySelectorAll("table.table-striped tbody tr");
                let isTeilnehmer = false;
                rows.forEach(r => {
                    const cols = r.querySelectorAll("td");
                    if (cols.length < 4) return;
                    const profileLink = cols[2].querySelector("a");
                    const id = profileLink?.href.split("/").pop();
                    if (id == profileId) isTeilnehmer = true;
                });
                if (isTeilnehmer || s.leiter.includes(userinfo.name)) {
                    schoolingsToday.push({ name: s.name, end: s.end });
                }
            }

            schoolingsToday.sort((a, b) => a.end - b.end);

            if (schoolingsToday.length === 0) {
                html += `<li>${schoolingSec.emptyText}</li>`;
            } else {
                schoolingsToday.forEach(s => {
                    html += `<li><strong>${s.name}</strong><br><span class="date">Endet am ${formatDate(s.end)}</span></li>`;
                });
            }
            html += "</ul>";

            showModal(html);

        } catch (err) {
            showModal(`<div class="lss-error">⚠️ Fehler beim Laden der Daten:<br>${err.message}</div>`);
        }
    }

    function showModal(content) {
        const existing = document.querySelector("#lss-daily-modal");
        if (existing) existing.remove();

        const modal = document.createElement("div");
        modal.id = "lss-daily-modal";
        modal.innerHTML = `
            <div class="lss-modal-backdrop"></div>
            <div class="lss-modal-content">
                <div class="lss-modal-header">
                    <span>Bau- und Lehrgangsübersicht</span>
                    <button class="btn btn-xs btn-danger lss-close">×</button>
                </div>
                <div class="lss-modal-body">${content}</div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector(".lss-close").addEventListener("click", () => modal.remove());
        modal.querySelector(".lss-modal-backdrop").addEventListener("click", () => modal.remove());
    }

    GM_addStyle(`
        #lss-daily-modal {
            position: fixed;
            top:0; left:0;
            width:100%; height:100%;
            z-index:9999;
            display:flex;
            justify-content:center;
            align-items:center;
            font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;
        }
        .lss-modal-backdrop {
            position:absolute;
            top:0; left:0;
            width:100%; height:100%;
            background:rgba(0,0,0,0.6);
        }
        .lss-modal-content {
            position:relative;
            background:#f8f8f8;
            color:#333;
            border-radius:10px;
            width:650px;
            max-height:85vh;
            box-shadow:0 0 15px rgba(0,0,0,0.3);
            animation:fadeIn 0.2s ease-in-out;
            z-index:1;
            display:flex;
            flex-direction:column;
        }
        .lss-modal-header {
            background:#c9302c;
            color:#fff;
            padding:10px 15px;
            font-weight:bold;
            display:flex;
            justify-content:space-between;
            align-items:center;
            border-radius:8px 8px 0 0;
            flex-shrink:0;
        }
        .lss-modal-body {
            padding:15px 20px;
            overflow-y:auto;
            max-height:70vh;
            scrollbar-width: thin;
            scrollbar-color: #ccc #f8f8f8;
        }
        .lss-modal-body::-webkit-scrollbar {
            width: 8px;
        }
        .lss-modal-body::-webkit-scrollbar-track {
            background: #f8f8f8;
            border-radius: 10px;
        }
        .lss-modal-body::-webkit-scrollbar-thumb {
            background-color: #ccc;
            border-radius: 10px;
        }
        .lss-header {
            font-weight:700;
            font-size:16px;
            margin-bottom:10px;
        }
        .lss-modal-body h3 {
            color:#333;
            font-weight:700;
            font-size:15px;
            border-bottom:1px solid #ddd;
            padding-bottom:3px;
            margin-top:15px;
        }
        .lss-modal-body ul {
            list-style:none;
            padding-left:0;
            margin-bottom:10px;
        }
        .lss-modal-body li {
            background:#fff;
            margin-bottom:6px;
            padding:8px 10px;
            border-radius:6px;
            border:1px solid #e0e0e0;
            box-shadow:inset 0 0 2px rgba(0,0,0,0.05);
        }
        .lss-modal-body .date {
            color:#666;
            font-size:12px;
        }
        .lss-error {
            color:#c9302c;
            font-weight:bold;
            padding:10px;
        }
        @keyframes fadeIn {
            from { opacity:0; transform:scale(0.98); }
            to { opacity:1; transform:scale(1); }
        }
    `);

    const observer = new MutationObserver(() => {
        if (document.querySelector("#menu_profile + .dropdown-menu > li.divider")) {
            createMenuItem();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
