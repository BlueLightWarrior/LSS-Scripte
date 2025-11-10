// ==UserScript==
// @name         LSS Tägliche Bau‑ und Lehrgangsübersicht
// @namespace    https://www.leitstellenspiel.de/
// @version      1.2
// @description  Zeigt an, welche Gebäude‑Erweiterungen, Lagerräume, Spezialisierungen und Lehrgänge heute fertig werden.
// @author       BlueLightWarrior
// @match        https://www.leitstellenspiel.de/*
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @grant        GM_getValue
// @grant        GM_setValue
// @resource     icon https://github.com/BlueLightWarrior/LSS-Scripte/raw/main/LSS%20T%C3%A4gliche%20Bau-%20und%20Lehrgangs%C3%BCbersicht/Icon.png
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = "https://www.leitstellenspiel.de";
    const CACHE_KEY = "lss_daily_cache";
    const CACHE_TIME_KEY = "lss_daily_cache_time";
    const CACHE_DURATION = 10 * 60 * 1000; // 10 Minuten
    const todayString = new Date().toDateString();

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
        a.appendChild(document.createTextNode("Bau‑ und Lehrgangsübersicht"));
        a.addEventListener("click", (e) => {
            e.preventDefault();
            showDailyOverviewModal();
        });

        triggerLi.appendChild(a);

        const menuDivider = document.querySelector('#menu_profile + .dropdown-menu > li.divider');
        if (menuDivider) menuDivider.before(triggerLi);
    }

    async function getJSON(url) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json();
    }

    function formatTime(dt) {
        const d = new Date(dt);
        return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }

    function isCacheValid() {
        const cacheTime = GM_getValue(CACHE_TIME_KEY, 0);
        const cacheDate = new Date(cacheTime);
        return (Date.now() - cacheTime < CACHE_DURATION) && (cacheDate.toDateString() === todayString);
    }

    async function fetchData() {
        const [userinfo, buildingsData, schoolingsDataRaw] = await Promise.all([
            getJSON(`${BASE_URL}/api/userinfo`),
            getJSON(`${BASE_URL}/api/buildings`),
            getJSON(`${BASE_URL}/api/schoolings`)
        ]);

        const profileId = userinfo.user_id;

        const schoolingsData = Array.isArray(schoolingsDataRaw)
            ? schoolingsDataRaw
            : (schoolingsDataRaw.schoolings || schoolingsDataRaw.result || []);

        // Daten verarbeiten
        const sections = [
            { key: "extensions", icon: "🏢", title: "Gebäude‑Erweiterungen", emptyText: "Heute werden keine Gebäude‑Erweiterungen fertig." },
            { key: "storage_upgrades", icon: "📦", title: "Lagerräume", emptyText: "Heute werden keine Lagerräume fertig." },
            { key: "specialization", icon: "🔧", title: "Spezialisierungen", emptyText: "Heute werden keine Spezialisierungen fertig." },
            { key: "schoolings", icon: "🎓", title: "Lehrgänge", emptyText: "Heute enden keine Lehrgänge." }
        ];

        const result = { buildings: [], schoolings: [] };

        // Gebäude-Sektionen
        for (const sec of sections.slice(0, 3)) {
            const items = [];
            buildingsData.forEach(b => {
                if (sec.key === "specialization") {
                    const sp = b.specialization;
                    if (sp?.available_at) {
                        const dt = new Date(sp.available_at);
                        if (dt.toDateString() === todayString) {
                            items.push({ name: sp.caption, building: b.caption, date: dt });
                        }
                    }
                } else {
                    (b[sec.key] || []).forEach(item => {
                        if (item.available_at) {
                            const dt = new Date(item.available_at);
                            if (dt.toDateString() === todayString) {
                                const label = item.caption || item.upgrade_type;
                                items.push({ name: label, building: b.caption, date: dt });
                            }
                        }
                    });
                }
            });
            items.sort((a, b) => a.date - b.date);
            result.buildings.push({ section: sec, items });
        }

        // Lehrgänge
        const schoolingsToday = [];
        schoolingsData.forEach(s => {
            if (s.finish_time) {
                const dt = new Date(s.finish_time * 1000);
                if (dt.toDateString() === todayString) {
                    if (s.participants?.some(p => p.user_id === profileId) || s.leader_user_id === profileId) {
                        schoolingsToday.push({ name: s.name, date: dt });
                    }
                }
            }
        });
        schoolingsToday.sort((a, b) => a.date - b.date);
        result.schoolings = { section: sections[3], items: schoolingsToday };

        // Cache speichern
        GM_setValue(CACHE_KEY, JSON.stringify(result));
        GM_setValue(CACHE_TIME_KEY, Date.now());

        return result;
    }

    async function showDailyOverviewModal() {
        let data;
        try {
            if (isCacheValid()) {
                // Cache nutzen
                data = JSON.parse(GM_getValue(CACHE_KEY));
            } else {
                // Daten holen und Cache aktualisieren
                data = await fetchData();
            }

            let html = `<div class="lss-header">📅 Heutige Fertigstellungen</div>`;

            // Gebäude anzeigen
            data.buildings.forEach(bSec => {
                html += `<h3>${bSec.section.icon} ${bSec.section.title}</h3><ul>`;
                if (bSec.items.length === 0) {
                    html += `<li>${bSec.section.emptyText}</li>`;
                } else {
                    bSec.items.forEach(it => {
                        html += `<li><strong>${it.building}</strong>: ${it.name}<br><span class="date">Fertig um ${formatTime(it.date)}</span></li>`;
                    });
                }
                html += `</ul>`;
            });

            // Lehrgänge anzeigen
            const sSec = data.schoolings.section;
            html += `<h3>${sSec.icon} ${sSec.title}</h3><ul>`;
            if (data.schoolings.items.length === 0) {
                html += `<li>${sSec.emptyText}</li>`;
            } else {
                data.schoolings.items.forEach(it => {
                    html += `<li><strong>${it.name}</strong><br><span class="date">Fertig um ${formatTime(it.date)}</span></li>`;
                });
            }
            html += `</ul>`;

            showModal(html);

            // Hintergrund-Update (optional, ohne Modal zu blockieren)
            fetchData().catch(() => { /* Fehler ignorieren, Cache bleibt */ });

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
                    <span>Bau‑ und Lehrgangsübersicht</span>
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
        #lss-daily-modal { position: fixed; top:0; left:0; width:100%; height:100%; z-index:9999; display:flex; justify-content:center; align-items:center; font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; }
        .lss-modal-backdrop { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); }
        .lss-modal-content { position:relative; background:#f8f8f8; color:#333; border-radius:10px; width:650px; max-height:85vh; box-shadow:0 0 15px rgba(0,0,0,0.3); animation:fadeIn 0.2s ease-in-out; z-index:1; display:flex; flex-direction:column; }
        .lss-modal-header { background:#c9302c; color:#fff; padding:10px 15px; font-weight:bold; display:flex; justify-content:space-between; align-items:center; border-radius:8px 8px 0 0; flex-shrink:0; }
        .lss-modal-body { padding:15px 20px; overflow-y:auto; max-height:70vh; scrollbar-width: thin; scrollbar-color: #ccc #f8f8f8; }
        .lss-modal-body::-webkit-scrollbar { width: 8px; }
        .lss-modal-body::-webkit-scrollbar-track { background: #f8f8f8; border-radius: 10px; }
        .lss-modal-body::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 10px; }
        .lss-header { font-weight:700; font-size:16px; margin-bottom:10px; }
        .lss-modal-body h3 { color:#333; font-weight:700; font-size:15px; border-bottom:1px solid #ddd; padding-bottom:3px; margin-top:15px; }
        .lss-modal-body ul { list-style:none; padding-left:0; margin-bottom:10px; }
        .lss-modal-body li { background:#fff; margin-bottom:6px; padding:8px 10px; border-radius:6px; border:1px solid #e0e0e0; box-shadow:inset 0 0 2px rgba(0,0,0,0.05); }
        .lss-modal-body .date { color:#666; font-size:12px; }
        .lss-error { color:#c9302c; font-weight:bold; padding:10px; }
        @keyframes fadeIn { from { opacity:0; transform:scale(0.98); } to { opacity:1; transform:scale(1); } }
    `);

    const menuObserver = new MutationObserver(() => {
        const menuDivider = document.querySelector('#menu_profile + .dropdown-menu > li.divider');
        if (menuDivider) {
            createMenuItem();
            menuObserver.disconnect();
        }
    });
    menuObserver.observe(document.body, { childList: true, subtree: true });

})();
