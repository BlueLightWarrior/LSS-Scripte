// ==UserScript==
// @name         LSS Tägliche Bau- und Lehrgangsübersicht
// @namespace    https://www.leitstellenspiel.de/
// @version      1.3
// @description  Zeigt alle heute fertig werdenden Gebäude-Erweiterungen, Lagerräume, Spezialisierungen und Lehrgänge auf einen Blick.
// @author       BlueLightWarrior
// @match        https://www.leitstellenspiel.de/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = "https://www.leitstellenspiel.de";
    const today = new Date().toDateString();

    function createMenuItem() {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";

        const img = document.createElement("img");
        img.src = "https://raw.githubusercontent.com/BlueLightWarrior/LSS-Scripte/main/LSS%20T%C3%A4gliche%20Bau-%20und%20Lehrgangs%C3%BCbersicht/Icon.png";
        img.width = 24;
        img.height = 24;
        img.style.verticalAlign = "middle";
        img.style.marginRight = "6px";

        a.append(img, document.createTextNode("Bau- und Lehrgangsübersicht"));
        a.addEventListener("click", e => { e.preventDefault(); showDailyOverview(); });

        li.append(a);
        document.querySelector('#menu_profile + .dropdown-menu > li.divider')?.before(li);
    }

    async function fetchData(url, asJSON = true) {
        const res = await fetch(url, { credentials: "include" });
        return asJSON ? res.json() : res.text();
    }

    const formatDate = dt => new Date(dt).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    // Hilfsfunktion: fetch in Batches für begrenzte parallele Requests
    async function fetchInBatches(urlObjs, batchSize = 3) {
        const results = [];
        for (let i = 0; i < urlObjs.length; i += batchSize) {
            const batch = urlObjs.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(u => fetchData(u.url, false)));
            results.push(...batchResults);
        }
        return results;
    }

    async function showDailyOverview() {
        const [userinfo, buildings, schoolingHTML] = await Promise.all([
            fetchData(`${BASE_URL}/api/userinfo`),
            fetchData(`${BASE_URL}/api/buildings`),
            fetchData(`${BASE_URL}/schoolings`, false)
        ]);

        const parser = new DOMParser();
        const doc = parser.parseFromString(schoolingHTML, "text/html");

        const schoolings = [...doc.querySelectorAll("table.table-striped tbody tr")]
            .map(row => {
                const [nameCell, timeCell, leaderCell] = row.querySelectorAll("td");
                if (!nameCell || !leaderCell) return null;
                const link = nameCell.querySelector("a");
                const end = timeCell?.getAttribute("sortvalue");
                return link ? {
                    name: nameCell.textContent.trim(),
                    end: end ? new Date(Date.now() + end * 1000) : null,
                    leiter: leaderCell.textContent.trim(),
                    url: link.href
                } : null;
            })
            .filter(Boolean);

        let html = `<div><b>Fertigstellungen am ${new Date().toLocaleDateString("de-DE")}</b></div><br>`;

        const sections = [
            { key: "extensions", title: "🏢 Gebäude-Erweiterungen" },
            { key: "storage_upgrades", title: "📦 Lagerräume" },
            { key: "specialization", title: "🔧 Spezialisierungen" }
        ];

        for (const sec of sections) {
            html += `<h5 style="font-weight:bold;">${sec.title}</h5><ul>`;
            const items = [];

            buildings.forEach(b => {
                const entries = sec.key === "specialization"
                    ? [b.specialization].filter(Boolean)
                    : b[sec.key] || [];

                entries.forEach(it => {
                    const date = new Date(it.available_at);
                    if (it.available_at && date.toDateString() === today) {
                        items.push({
                            name: it.caption || it.upgrade_type,
                            building: b.caption,
                            date
                        });
                    }
                });
            });

            if (items.length === 0) {
                html += `<li>Heute keine Einträge vorhanden.</li>`;
            } else {
                items.sort((a, b) => a.date - b.date);
                html += items.map(it =>
                    `<li><b>${it.building}</b>: ${it.name} (Fertig am: ${formatDate(it.date)})</li>`
                ).join("");
            }
            html += "</ul><br>";
        }

        html += `<h5 style="font-weight:bold;">🎓 Lehrgänge</h5><ul>`;
        const todayTrainings = [];

        const schoolingURLs = schoolings.filter(s => s.end && s.end.toDateString() === today)
                                        .map(s => ({ url: s.url, obj: s }));

        const detailsHTML = await fetchInBatches(schoolingURLs, 3);

        detailsHTML.forEach((htmlStr, index) => {
            const s = schoolingURLs[index].obj;
            const detailDoc = parser.parseFromString(htmlStr, "text/html");
            const isTeilnehmer = [...detailDoc.querySelectorAll("table.table-striped tbody tr a[href^='/profile/']")]
                .some(a => a.href.endsWith(`/${userinfo.user_id}`));
            if (isTeilnehmer || s.leiter.includes(userinfo.name)) todayTrainings.push(s);
        });

        if (todayTrainings.length === 0) {
            html += `<li>Heute keine Einträge vorhanden.</li>`;
        } else {
            todayTrainings.sort((a, b) => a.end - b.end);
            html += todayTrainings.map(s =>
                `<li><b>${s.name}</b> (Fertig am: ${formatDate(s.end)})</li>`
            ).join("");
        }

        html += "</ul>";

        showSimpleModal(html);
    }

    function showSimpleModal(content) {
        document.querySelector("#lss-simple-modal")?.remove();
        const modal = document.createElement("div");
        modal.id = "lss-simple-modal";
        modal.innerHTML = `
            <div class="modal-backdrop fade in"></div>
            <div class="modal" style="display:block;">
                <div class="modal-dialog" style="width:600px;">
                    <div class="modal-content">
                        <div class="modal-header" style="background:#c9302c; color:white;">
                            <button type="button" class="close" data-dismiss="modal">&times;</button>
                            <h4 class="modal-title">Bau- und Lehrgangsübersicht</h4>
                        </div>
                        <div class="modal-body">${content}</div>
                    </div>
                </div>
            </div>
        `;
        document.body.append(modal);
        modal.querySelector(".close").addEventListener("click", () => modal.remove());
        modal.querySelector(".modal-backdrop").addEventListener("click", () => modal.remove());
    }

    const observer = new MutationObserver(() => {
        if (document.querySelector("#menu_profile + .dropdown-menu > li.divider")) {
            createMenuItem();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
