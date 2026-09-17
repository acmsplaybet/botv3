// ==UserScript==
// @name         BetPulse Intelligence (BPI) - V6 Master Bot
// @version      6.0
// @match        https://betmines.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // 1. STYLES FOR THE CONTROL PANEL & THE INDEPENDENT HUD
    GM_addStyle(`
        #bpi-panel { position:fixed; top:20px; right:20px; z-index:999999; background:rgba(15,23,42,0.95); border:2px solid #3b82f6; padding:15px; border-radius:12px; color:white; width:320px; font-family:'Segoe UI', sans-serif; backdrop-filter: blur(10px); box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .bpi-header { font-weight:900; color:#60a5fa; display:flex; justify-content:space-between; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #334155; padding-bottom: 8px;}
        .bpi-btn { width:100%; padding:10px; margin-top:8px; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: 0.2s; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;}
        .btn-night { background: #8b5cf6; color: white; }
        .btn-live { background: #ef4444; color: white; }
        .btn-auto { background: #10b981; color: white; }
        .bpi-btn:hover { filter: brightness(1.2); transform: scale(0.98); }
        #bpi-log { font-size:11px; color:#94a3b8; margin-top:10px; max-height:250px; overflow-y:auto; padding-top:5px; font-family: monospace; }
        .log-entry { margin-bottom: 4px; border-bottom: 1px dashed #334155; padding-bottom: 2px; }
        .bpi-status { display:flex; justify-content: space-between; font-size: 11px; margin-top: 10px; color: #cbd5e1; }

        /* SLEEK INDEPENDENT TRACKER HUD */
        #bpi-hud { position:fixed; bottom:20px; right:20px; z-index:999999; background:rgba(15,23,42,0.92); border:1px solid #10b981; padding:12px 15px; border-radius:10px; color:white; width:290px; font-family:'Segoe UI', sans-serif; backdrop-filter: blur(8px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); border-left: 4px solid #10b981; transition: 0.3s; }
        .hud-row { display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 11px; color: #94a3b8; }
        .hud-row:last-child { margin-bottom: 0; }
        .hud-value { font-weight:bold; color:#f8fafc; font-family:monospace; }
        .hud-title { font-weight:800; color:#10b981; font-size:12px; border-bottom:1px solid rgba(16,185,129,0.2); padding-bottom:4px; margin-bottom:8px; display:flex; justify-content:space-between; }

        @keyframes hudPulse {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
        }
    `);

    // 2. STATE MANAGEMENT & UTILS
    let masterData = [];
    let isAutoPilot = localStorage.getItem('bpi_autopilot') === 'true';
    let isPaused = false;
    let currentMode = localStorage.getItem('bpi_mode') || 'IDLE'; // NIGHT, LIVE, IDLE
    let globalTimer = null;

    // Custom Settings
    let liveInterval = parseInt(localStorage.getItem('bpi_live_int') || '3'); // Dakika
    let nightInterval = parseInt(localStorage.getItem('bpi_night_int') || '60'); // Dakika
    let apiEndpoint = localStorage.getItem('bpi_api_url') || 'https://realmobilebet.com/bpiv2/api/receiver.php';
    let nightHoursStr = localStorage.getItem('bpi_night_hours') || '0,3,6,9,12,15,18,21';
    let nightHours = nightHoursStr.split(',').map(Number);

    function log(msg, type = "info") {
        let l = document.getElementById("bpi-log");
        if (!l) return;
        let color = type === "success" ? "#4ade80" : (type === "warning" ? "#facc15" : (type === "error" ? "#f87171" : "#94a3b8"));
        l.innerHTML = `<div class="log-entry" style="color:${color}">[${new Date().toLocaleTimeString()}] ${msg}</div>` + l.innerHTML;
    }

    function formatDate(d) {
        let day = String(d.getDate()).padStart(2, '0');
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    function cleanImgUrl(rawUrl) {
        if (!rawUrl) return "";
        let parts = rawUrl.split('https://');
        return parts.length > 1 ? 'https://' + parts[parts.length - 1] : rawUrl;
    }

    // HUMAN-LIKE BEHAVIOR HELPERS
    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomDelay(min, max) {
        return new Promise(r => setTimeout(r, randomInt(min, max)));
    }

    // 3. UI CREATION
    function createPanel() {
        if (document.getElementById("bpi-panel")) return;
        let panel = document.createElement("div");
        panel.id = "bpi-panel";
        panel.innerHTML = `
            <div class="bpi-header">
                <span>BPI V6.0 BOT</span>
                <span id="bpi-count" style="color:#4ade80;">0 Maç</span>
            </div>
            <button id="btn-night" class="bpi-btn btn-night">GECE (FULL) SENKRON</button>
            <button id="btn-live" class="bpi-btn btn-live">CANLI (LIVE) RADAR</button>

            <div style="display:flex; gap:5px; margin-top:8px;">
                <button id="btn-start" class="bpi-btn" style="background:#10b981; margin-top:0; flex:1;">BAŞLAT</button>
                <button id="btn-pause" class="bpi-btn" style="background:#f59e0b; margin-top:0; flex:1;">DURAKLAT</button>
                <button id="btn-stop" class="bpi-btn" style="background:#ef4444; margin-top:0; flex:1;">STOP</button>
            </div>

            <button id="btn-settings" class="bpi-btn" style="background:#475569;">⚙️ AYARLAR</button>

            <div id="bpi-settings" style="display:none; margin-top:10px; font-size:11px; border-top:1px solid #334155; padding-top:10px;">
                <div><label>Canlı Tarama (Dk):</label><input type="number" id="inp-live" value="${liveInterval}" style="width:100%; margin:2px 0 8px; background:#1e293b; border:1px solid #475569; color:white; padding:4px; border-radius:4px;"></div>
                <div><label>Gece Tarama (Dk):</label><input type="number" id="inp-night" value="${nightInterval}" style="width:100%; margin:2px 0 8px; background:#1e293b; border:1px solid #475569; color:white; padding:4px; border-radius:4px;"></div>
                <div><label>Gece Saatleri (Örn: 0,3,6):</label><input type="text" id="inp-hours" value="${nightHoursStr}" style="width:100%; margin:2px 0 8px; background:#1e293b; border:1px solid #475569; color:white; padding:4px; border-radius:4px;"></div>
                <div><label>Alıcı URL:</label><input type="text" id="inp-api" value="${apiEndpoint}" style="width:100%; margin:2px 0 8px; background:#1e293b; border:1px solid #475569; color:white; padding:4px; border-radius:4px;"></div>
                <button id="btn-save" class="bpi-btn" style="background:#3b82f6;">KAYDET</button>
            </div>

            <div class="bpi-status">
                <span>Mod: <b id="mode-text">${currentMode}</b></span>
                <span>Yenileme: <b id="timer-text">--:--</b></span>
            </div>
            <div id="bpi-log"></div>
        `;
        document.body.appendChild(panel);

        document.getElementById("btn-night").onclick = () => { localStorage.setItem('bpi_mode', 'NIGHT'); location.reload(); };
        document.getElementById("btn-live").onclick = () => { localStorage.setItem('bpi_mode', 'LIVE'); location.reload(); };
        document.getElementById("btn-start").onclick = () => {
            if (isAutoPilot && !isPaused) { log("Bot zaten çalışıyor.", "warning"); return; }
            isAutoPilot = true;
            isPaused = false;
            localStorage.setItem('bpi_autopilot', 'true');
            log("Otopilot BAŞLATILDI.", "success");
            initAutoPilot();
            updateHUD();
        };

        document.getElementById("btn-pause").onclick = () => {
            if (!isAutoPilot) return;
            isPaused = !isPaused;
            document.getElementById("btn-pause").innerText = isPaused ? "DEVAM ET" : "DURAKLAT";
            document.getElementById("btn-pause").style.background = isPaused ? "#10b981" : "#f59e0b";
            log(isPaused ? "Bot DURAKLATILDI. Bekleniyor..." : "Bot DEVAM EDİYOR.", "warning");
            updateHUD();
        };

        document.getElementById("btn-stop").onclick = () => {
            isAutoPilot = false;
            isPaused = false;
            localStorage.setItem('bpi_autopilot', 'false');
            currentMode = 'IDLE';
            localStorage.setItem('bpi_mode', 'IDLE');
            document.getElementById("mode-text").innerText = "IDLE";
            document.getElementById("timer-text").innerText = "--:--";
            localStorage.setItem('bpi_total_scans', '0'); // Tarama sayısını sıfırla
            if (globalTimer) clearInterval(globalTimer);
            log("Otopilot TAMAMEN DURDURULDU.", "error");
            updateHUD();
        };

        document.getElementById("btn-settings").onclick = () => {
            let el = document.getElementById("bpi-settings");
            el.style.display = el.style.display === "none" ? "block" : "none";
        };

        document.getElementById("btn-save").onclick = () => {
            localStorage.setItem('bpi_live_int', document.getElementById("inp-live").value);
            localStorage.setItem('bpi_night_int', document.getElementById("inp-night").value);
            localStorage.setItem('bpi_night_hours', document.getElementById("inp-hours").value);
            localStorage.setItem('bpi_api_url', document.getElementById("inp-api").value);
            alert("Ayarlar kaydedildi! Sayfa yenileniyor...");
            location.reload();
        };
    }

    // 3.1 INDEPENDENT HUD CREATION & ANIMATION
    function createHUD() {
        if (document.getElementById("bpi-hud")) return;
        let hud = document.createElement("div");
        hud.id = "bpi-hud";
        hud.innerHTML = `
            <div class="hud-title">
                <span>⚡ BPI OTOPİLOT TAKİP PANELİ</span>
                <span id="hud-status-dot" style="animation: hudPulse 1.5s infinite; font-weight: 900;">● Yükleniyor</span>
            </div>
            <div class="hud-row">
                <span>Tam Taramaya Kalan:</span>
                <span id="hud-countdown" class="hud-value">--:--</span>
            </div>
            <div class="hud-row">
                <span>Yapılan Toplam Tarama:</span>
                <span id="hud-scans" class="hud-value">0 Tarama</span>
            </div>
            <div class="hud-row">
                <span>Son Tam Senkron Saati:</span>
                <span id="hud-last-sync" class="hud-value">Yapılmadı</span>
            </div>
        `;
        document.body.appendChild(hud);
    }

    function updateHUD() {
        let hud = document.getElementById("bpi-hud");
        if (!hud) return;

        let totalScans = localStorage.getItem('bpi_total_scans') || '0';
        let lastFullSync = parseInt(localStorage.getItem('bpi_last_full_sync') || '0');
        let now = new Date().getTime();
        let nightIntervalMs = nightInterval * 60000;

        let timePassed = now - lastFullSync;
        let timeLeft = nightIntervalMs - timePassed;

        let countdownStr = "--:--";

        if (!isAutoPilot) {
            countdownStr = "Pasif / Beklemede";
            document.getElementById("hud-status-dot").style.color = "#ef4444";
            document.getElementById("hud-status-dot").innerText = "● Pasif";
            hud.style.borderColor = "#ef4444";
            hud.style.borderLeftColor = "#ef4444";
            document.querySelector(".hud-title").style.color = "#ef4444";
            document.querySelector(".hud-title").style.borderBottomColor = "rgba(239, 68, 68, 0.2)";
        } else if (isPaused) {
            countdownStr = "Duraklatıldı";
            document.getElementById("hud-status-dot").style.color = "#f59e0b";
            document.getElementById("hud-status-dot").innerText = "● Beklemede";
            hud.style.borderColor = "#f59e0b";
            hud.style.borderLeftColor = "#f59e0b";
            document.querySelector(".hud-title").style.color = "#f59e0b";
            document.querySelector(".hud-title").style.borderBottomColor = "rgba(245, 158, 11, 0.2)";
        } else {
            document.getElementById("hud-status-dot").style.color = "#10b981";
            document.getElementById("hud-status-dot").innerText = "● Aktif";
            hud.style.borderColor = "#10b981";
            hud.style.borderLeftColor = "#10b981";
            document.querySelector(".hud-title").style.color = "#10b981";
            document.querySelector(".hud-title").style.borderBottomColor = "rgba(16, 185, 129, 0.2)";

            if (lastFullSync > 0 && timeLeft > 0) {
                let m = Math.floor(timeLeft / 60000);
                let s = Math.floor((timeLeft % 60000) / 1000);
                countdownStr = `${m.toString().padStart(2, '0')} dk ${s.toString().padStart(2, '0')} sn`;
            } else {
                countdownStr = "Şimdi Başlıyor...";
            }
        }

        document.getElementById("hud-scans").innerText = totalScans + " Tarama";
        document.getElementById("hud-countdown").innerText = countdownStr;

        let lastSyncDate = lastFullSync > 0 ? new Date(lastFullSync).toLocaleTimeString() : "Yapılmadı";
        document.getElementById("hud-last-sync").innerText = lastSyncDate;
    }

    async function checkPause() {
        while (isPaused) {
            if (!isAutoPilot) return;
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    function initAutoPilot() {
        log("Otopilot Algoritması başlatılıyor...", "warning");
        let startMode = localStorage.getItem('bpi_mode');

        // Eğer kullanıcı özellikle CANLI RADAR butonuna basıp sayfayı yenilediyse LIVE ile başlasın.
        // Geri kalan her durumda (F5 yenileme, Gece Butonu, İlk açılış) doğrudan tam tarama ile başlasın!
        if (startMode === 'LIVE') {
            log("CANLI RADAR modu el ile seçilmiş. Canlı tarama başlatılıyor...", "success");
            currentMode = 'LIVE';
            localStorage.setItem('bpi_mode', 'LIVE');
            document.getElementById("mode-text").innerText = currentMode;
            runLiveSync();
        } else {
            log("Başlangıç veya manuel tetikleme: Doğrudan FULL SENKRON başlatılıyor...", "warning");
            currentMode = 'NIGHT';
            localStorage.setItem('bpi_mode', 'NIGHT');
            document.getElementById("mode-text").innerText = currentMode;
            runNightSync();
        }
    }

    // 4. PARSER LOGIC
    function parseMatchesOnPage(dateLabel = "Today") {
        let collected = new Map();
        let currentLeague = "Unknown League";
        let currentLeagueFlag = "";

        document.querySelectorAll('div.tw-flex-row, div.tw-grid').forEach(el => {
            // A. LİG TESPİTİ (Bayrak ve İsim)
            let leagueEl = el.querySelector('a[href*="/league/"]');
            if (leagueEl) {
                let textSpans = leagueEl.querySelectorAll('span.tw-text-bm-black');
                if (textSpans.length >= 3) {
                    currentLeague = textSpans[0].innerText.trim() + " - " + textSpans[2].innerText.trim();
                }
                let flagImg = el.querySelector('img');
                if (flagImg) currentLeagueFlag = cleanImgUrl(flagImg.src);
                return; // Lig satırıysa aşağı inme
            }

            // B. MAÇ TESPİTİ
            let matchLink = el.querySelector('a[href*="/matches/"]');
            if (matchLink) {
                let teams = el.querySelectorAll('p.tw-text-bm-black');
                if (teams.length >= 2) {
                    let home = teams[0].innerText.trim();
                    let away = teams[1].innerText.trim();
                    let key = home + "|" + away;

                    if (["Tools", "Predictions"].some(x => home.includes(x))) return;

                    // Benzersiz Maç ID'si Çekimi (URL'in sonundaki sayıyı bulur: örn _19637179 veya -123456)
                    let matchId = "";
                    let href = matchLink.getAttribute('href');
                    if (href) {
                        let idMatch = href.match(/[-_](\d+)$/) || href.match(/\/(\d+)$/);
                        if (idMatch) {
                            matchId = idMatch[1];
                        }
                    }
                    if (!matchId) {
                        // Geriye dönük uyumluluk için fallback benzersiz anahtar
                        matchId = (home + "_" + away + "_" + dateLabel).replace(/\s+/g, "");
                    }

                    // Takım Logoları
                    let imgs = el.querySelectorAll('img.tw-rounded-full');
                    let homeLogo = imgs.length >= 1 ? cleanImgUrl(imgs[0].src) : "";
                    let awayLogo = imgs.length >= 2 ? cleanImgUrl(imgs[1].src) : "";

                    // Dakika, Saat ve Canlı Skoru
                    let minuteEl = el.querySelector('p.tw-text-bm-live-text');
                    let timeEl = el.querySelector('.tw-text-bm-gray-font.tw-text-xs, .tw-text-bm-gray-font-2.tw-text-xs');
                    let matchTime = timeEl ? timeEl.innerText.trim() : "";
                    let liveMinute = minuteEl ? minuteEl.innerText.replace("'", "").trim() : "";
                    let isLive = minuteEl && minuteEl.querySelector('.tw-animate-ping') !== null;

                    // Skor (Canlı veya FT)
                    let scoreDivs = el.querySelectorAll('div.tw-text-bm-red');
                    let score = "vs";
                    if (scoreDivs.length >= 2) {
                        score = scoreDivs[0].innerText.trim() + "-" + scoreDivs[1].innerText.trim();
                    } else {
                        let blackScores = el.querySelectorAll('div.tw-text-bm-black');
                        if (blackScores.length >= 2 && blackScores[0].innerText !== "") {
                            score = blackScores[0].innerText.trim() + "-" + blackScores[1].innerText.trim();
                        } else {
                            let whiteScores = el.querySelectorAll('div.tw-text-white, div.tw-text-bm-white');
                            if (whiteScores.length >= 2 && whiteScores[0].innerText !== "") {
                                score = whiteScores[0].innerText.trim() + "-" + whiteScores[1].innerText.trim();
                            }
                        }
                    }

                    // Tahmin ve Oran
                    let probEl = el.querySelector('p.tw-text-bm-gray-font-4.tw-font-bold');
                    let prob = probEl && probEl.innerText.includes('%') ? probEl.innerText : "0%";
                    let oddMatch = el.innerText.match(/\d+\.\d{2}/g);
                    let odd = oddMatch ? oddMatch.pop() : "0.00";
                    let tipElements = Array.from(el.querySelectorAll('p[class*="tw-text-bm-"]')).filter(p => p.innerText.length < 15 && !p.innerText.includes('%'));
                    let tip = tipElements.length > 0 ? tipElements[tipElements.length - 1].innerText.trim() : "N/A";

                    let fullText = el.innerText.toUpperCase();
                    let status = 'Waiting';
                    let result = "PENDING";

                    let isCanceledOrPostponed = false;
                    let cancelReason = '';
                    let scoreAbbr = 'POSTP';
                    let upperTime = matchTime.trim().toUpperCase();

                    if (upperTime === 'ABAN') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'ABAN'; }
                    else if (upperTime === 'CANCL') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'CANCL'; }
                    else if (upperTime === 'POSTP') { isCanceledOrPostponed = true; cancelReason = 'Postponed'; scoreAbbr = 'POSTP'; }
                    else if (upperTime === 'AWAR') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'AWAR'; }
                    else if (upperTime === 'AU') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'SUSP'; }
                    else if (upperTime === 'INT') { isCanceledOrPostponed = true; cancelReason = 'Canceled'; scoreAbbr = 'INT'; }

                    let isPlaying = isLive || minuteEl !== null || upperTime.includes('HT') || upperTime.includes('HALF') || /^\d+[']?$/.test(upperTime);

                    if (isCanceledOrPostponed) {
                        status = cancelReason;
                        result = 'POSTPONED';
                        score = scoreAbbr;
                    } else if (isPlaying) {
                        status = 'LIVE';
                        score = 'vs';
                        result = 'PENDING';
                    } else if (upperTime.includes('AET') || upperTime.includes('PEN')) {
                        status = 'Finished (AET)';
                        score = "vs"; // Uzatmalara gidince skoru sıfırla, manuel halledilecek
                    } else if (upperTime.includes('FT') || upperTime.includes('FINISHED')) {
                        status = 'Finished';
                    } else {
                        status = 'Waiting';
                        score = 'vs';
                        result = 'PENDING';
                    }

                    if (!isCanceledOrPostponed && !isPlaying) {
                        let rowContainer = el.closest('.tw-bg-bm-white') || el;
                        let rowHtml = rowContainer.outerHTML;
                        if (rowHtml.includes('bm-green')) {
                            result = 'WIN';
                            status = 'Finished';
                        } else if (rowHtml.includes('bm-red')) {
                            result = 'LOSE';
                            status = 'Finished';
                        }
                    }

                    if (!collected.has(key)) {
                        collected.set(key, {
                            match_id: matchId,
                            date_label: dateLabel,
                            league: currentLeague,
                            league_flag: currentLeagueFlag,
                            home: home,
                            home_logo: homeLogo,
                            away: away,
                            away_logo: awayLogo,
                            score: score,
                            minute: liveMinute,
                            time: matchTime,
                            prob: prob,
                            tip: tip,
                            odd: odd,
                            status: status,
                            result: result
                        });
                    }
                }
            }
        });
        return Array.from(collected.values());
    }

    // 5. MODES LOGIC
    async function smartScrollAndParse(dateString) {
        let localMatchesMap = new Map();

        window.scrollTo({ top: 0, behavior: 'smooth' });
        await randomDelay(1500, 2500);

        let totalHeight = document.body.scrollHeight;
        let currentPos = 0;

        log(`Tarama başladı. Sayfa boyutu: ${totalHeight}px`, "info");

        while (currentPos <= totalHeight) {
            await checkPause();
            if (!isAutoPilot) break;

            let step = randomInt(600, 1100);
            currentPos += step;
            window.scrollTo({ top: currentPos, behavior: 'smooth' });
            await randomDelay(900, 1700);

            parseMatchesOnPage(dateString).forEach(m => {
                localMatchesMap.set(m.home + "|" + m.away, m);
            });

            totalHeight = document.body.scrollHeight;

            if (window.pageYOffset + window.innerHeight >= totalHeight - 10) {
                parseMatchesOnPage(dateString).forEach(m => {
                    localMatchesMap.set(m.home + "|" + m.away, m);
                });
                break;
            }
        }

        log(`Tarama tamamlandı (${localMatchesMap.size} maç). Yukarı çıkılıyor...`, "success");

        window.scrollTo({ top: 0, behavior: 'smooth' });
        await randomDelay(1200, 2000);

        return Array.from(localMatchesMap.values());
    }

    async function runNightSync() {
        currentMode = 'NIGHT';
        localStorage.setItem('bpi_mode', 'NIGHT');
        document.getElementById("mode-text").innerText = currentMode;
        log("GECE MODU: Tarih barı aranıyor...", "warning");
        let dateBar = document.querySelector('div.tw-bg-bm-white.\\!tw-rounded-\\[4px\\]') || document.querySelector('div[class*="from-bm-primary-from"]');
        if (!dateBar) { log("Takvim bulunamadı, bekleniyor...", "error"); return setTimeout(runNightSync, 3000); }

        let buttons = Array.from(dateBar.querySelectorAll('.tw-cursor-pointer')).filter(b => !b.innerText.includes("Live"));

        let today = new Date();
        let todayDay = today.getDate();
        let todayIdx = buttons.findIndex(b => {
            let numMatch = b.innerText.match(/\d+/);
            if (numMatch) {
                return parseInt(numMatch[0]) === todayDay;
            }
            return b.innerText.includes("Today") || b.innerText.includes("Bugün") || b.innerText.includes("Bug");
        });
        if (todayIdx === -1) {
            todayIdx = buttons.findIndex(b => b.innerText.includes("Today") || b.querySelector('.tw-text-bm-primary-from'));
        }

        if (todayIdx === -1) { log("Today butonu bulunamadı!", "error"); return; }

        let targetTabs = [];
        if (todayIdx !== -1) {
            for (let i = todayIdx - 1; i <= todayIdx + 2; i++) {
                if (i >= 0 && i < buttons.length) {
                    let d = new Date();
                    d.setDate(today.getDate() + (i - todayIdx));
                    let dateStr = formatDate(d); // Örn: "13-05-2026"
                    let name = "";
                    if (i === todayIdx) name = "BUGÜN";
                    else if (i < todayIdx) name = "DÜN";
                    else if (i === todayIdx + 1) name = "YARIN";
                    else if (i === todayIdx + 2) name = "YARINDAN SONRA";
                    targetTabs.push({ idx: i, dateStr: dateStr, name: name });
                }
            }
        }

        for (let t of targetTabs) {
            await checkPause();
            if (!isAutoPilot) return; // Durdur'a basılırsa döngüden anında çık
            if (buttons[t.idx]) {
                log(`Tıklanıyor: ${t.name}`, "info");
                buttons[t.idx].click();
                await randomDelay(4200, 7500); // Sayfa yüklensin

                if (!isAutoPilot) return; // Bekleme sonrası kontrol

                log(`${t.name} (${t.dateStr}) sayfası en alta kadar taranıyor...`, "info");
                let matches = await smartScrollAndParse(t.dateStr);

                log(`${t.name} sekmesinde ${matches.length} maç bulundu.`, "success");
                masterData = masterData.concat(matches);
                document.getElementById("bpi-count").innerText = masterData.length + " Maç";
                window.scrollTo({ top: 0, behavior: 'smooth' });
                await randomDelay(1000, 2000);
            }
        }

        // Son tam senkron zamanını kaydet
        localStorage.setItem('bpi_last_full_sync', new Date().getTime().toString());
        log("FULL SENKRON tamamlandı. 15 saniye içinde CANLI/LIVE moda geçiş yapılıyor...", "success");
        sendDataAndReload(15000); // 15 saniye sonra yenile, canlıya geçsin
    }

    async function runLiveSync() {
        currentMode = 'LIVE';
        localStorage.setItem('bpi_mode', 'LIVE');
        document.getElementById("mode-text").innerText = currentMode;
        log("CANLI MOD: Tarih ayarlaması yapılıyor...", "warning");
        let dateBar = document.querySelector('div.tw-bg-bm-white.\\!tw-rounded-\\[4px\\]') || document.querySelector('div[class*="from-bm-primary-from"]');
        if (!dateBar) { log("Takvim bulunamadı, bekleniyor...", "error"); return setTimeout(runLiveSync, 3000); }

        let buttons = Array.from(dateBar.querySelectorAll('.tw-cursor-pointer')).filter(b => !b.innerText.includes("Live"));

        let today = new Date();
        let todayDay = today.getDate();
        let todayIdx = buttons.findIndex(b => {
            let numMatch = b.innerText.match(/\d+/);
            if (numMatch) {
                return parseInt(numMatch[0]) === todayDay;
            }
            return b.innerText.includes("Today") || b.innerText.includes("Bugün") || b.innerText.includes("Bug");
        });
        if (todayIdx === -1) {
            todayIdx = buttons.findIndex(b => b.innerText.includes("Today") || b.querySelector('.tw-text-bm-primary-from'));
        }
        let liveBtn = document.querySelector('.tw-bg-bm-light-red') || Array.from(document.querySelectorAll('p')).find(p => p.innerText === "Live")?.parentElement;

        if (todayIdx === -1 || !liveBtn) { log("Bugün veya Live butonu bulunamadı!", "error"); return setTimeout(runLiveSync, 3000); }

        let now = new Date();
        let h = now.getHours();
        let m = now.getMinutes();

        // 00:00 - 03:00 arasıysa hem dünü hem bugünü tara, değilse sadece bugünü tara
        let isLateNight = (h === 0 || h === 1 || h === 2);
        let targets = isLateNight ? [todayIdx - 1, todayIdx] : [todayIdx];

        let isAlreadyLive = liveBtn.classList.contains('tw-bg-bm-light-red');

        let todayDateStr = formatDate(now);

        // Zaten Today'in Live sekmesinde olup olmadığımızı tespit edelim
        let isLiveActive = document.querySelector('.tw-bg-bm-light-red') !== null;
        let activeTabBtn = dateBar.querySelector('.tw-text-bm-primary-from') || dateBar.querySelector('[class*="bm-primary-from"]');
        let isTodayActive = false;
        if (activeTabBtn) {
            let activeText = activeTabBtn.innerText || "";
            if (activeText.includes("Today") || activeText.includes("Bugün") || activeText.includes("BUGÜN")) {
                isTodayActive = true;
            }
        }

        let isAlreadyOnTodayLive = !isLateNight && isLiveActive && isTodayActive;

        if (isAlreadyOnTodayLive) {
            log("Zaten BUGÜN CANLI sayfasındayız, doğrudan sayfa taraması yapılıyor...", "info");
            let matches = await smartScrollAndParse(todayDateStr);
            log(`Canlı sayfada ${matches.length} maç bulundu.`, "success");
            masterData = masterData.concat(matches);
            window.scrollTo(0, 0);
        } else {
            for (let t of targets) {
                await checkPause();
                if (!isAutoPilot) return; // Durdur kontrolü

                if (t >= 0 && t < buttons.length) {
                    let diff = t - todayIdx;
                    let d = new Date();
                    d.setDate(now.getDate() + diff);
                    let dateStr = formatDate(d);

                    let dayName = t === todayIdx ? "BUGÜN (Today)" : "DÜN (Yesterday)";
                    log(`CANLI: Önce ${dayName} seçiliyor...`, "info");
                    buttons[t].click();
                    await randomDelay(4000, 6500); // Sekme yüklensin diye bekle

                    if (!isAutoPilot) return;

                    // Güncel live butonunu yeniden seçelim (sekme değiştiği için dom güncellenmiş olabilir)
                    let currentLiveBtn = document.querySelector('.tw-bg-bm-light-red') || Array.from(document.querySelectorAll('p')).find(p => p.innerText === "Live")?.parentElement;
                    if (currentLiveBtn) {
                        if (!currentLiveBtn.classList.contains('tw-bg-bm-light-red')) {
                            log(`CANLI: Live butonuna basıldı. Yüklenmesi bekleniyor...`, "warning");
                            currentLiveBtn.click();
                            await randomDelay(8000, 12000); // Filtre uygulansın diye bekle
                        } else {
                            log(`CANLI: Live butonu zaten aktif. Yüklenmesi bekleniyor...`, "warning");
                            await randomDelay(2000, 4000);
                        }
                    }

                    if (!isAutoPilot) return;

                    log(`${dayName} sekmesi en alta kadar taranıyor...`, "info");
                    let matches = await smartScrollAndParse(dateStr);

                    log(`${dayName} canlı sekmesinde ${matches.length} maç bulundu.`, "success");
                    masterData = masterData.concat(matches);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    await randomDelay(1000, 2000);
                }
            }
        }

        document.getElementById("bpi-count").innerText = masterData.length + " Canlı Maç";

        let sleepMs = 180000; // Varsayılan: Maç yoksa 3 dakika uyu
        if (masterData.length > 0) {
            sleepMs = 60000; // Maç varsa 1 dakikada bir güncelle
            log("Canlı maçlar bulunduğu için tarama aralığı 1 dakikaya düşürüldü.", "success");
        } else {
            log("Canlı maç yok, 3 dakika uyutuluyor...", "warning");
        }

        sendDataAndReload(sleepMs);
    }

    // 7. COUNTDOWN & START
    function startCountdown(targetTime, callback) {
        if (globalTimer) clearInterval(globalTimer);
        globalTimer = setInterval(() => {
            if (!isAutoPilot) {
                clearInterval(globalTimer);
                document.getElementById("timer-text").innerText = "--:--";
                return;
            }

            let now = new Date();
            let diff = targetTime - now;
            if (diff <= 0) {
                clearInterval(globalTimer);
                document.getElementById("timer-text").innerText = "00:00";
                callback();
            } else {
                let m = Math.floor((diff % 3600000) / 60000);
                let s = Math.floor((diff % 60000) / 1000);
                document.getElementById("timer-text").innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    function triggerNextCycle(timeoutMs) {
        if (!isAutoPilot) return;
        let targetTime = new Date(new Date().getTime() + timeoutMs);
        startCountdown(targetTime, () => {
            let now = new Date();
            let hh = now.getHours();
            let mm = now.getMinutes();

            if ((hh === 0 && mm >= 5 && mm <= 10) || (hh === 3 && mm >= 0 && mm <= 5)) {
                log("Gün değişimi: Sayfa yenileniyor (F5)...", "warning");
                location.reload();
                return;
            }

            masterData = []; // Veriyi sıfırla
            let lastFullSync = parseInt(localStorage.getItem('bpi_last_full_sync') || '0');
            let nowTime = new Date().getTime();
            let nightIntervalMs = nightInterval * 60000;

            if (nowTime - lastFullSync >= nightIntervalMs) {
                log("Periyodik tam senkron zamanı geldi! Sayfa temizlenip yenilenerek FULL SENKRON başlatılıyor...", "warning");
                currentMode = 'NIGHT';
                localStorage.setItem('bpi_mode', 'NIGHT');
                location.reload();
            } else {
                currentMode = 'LIVE';
                localStorage.setItem('bpi_mode', 'LIVE');
                document.getElementById("mode-text").innerText = currentMode;
                runLiveSync();
            }
        });
    }

    function sendDataAndReload(timeoutMs) {
        log(`Veri gönderiliyor (${masterData.length} maç)...`, "warning");

        GM_xmlhttpRequest({
            method: "POST",
            url: apiEndpoint,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ data: masterData, mode: currentMode, key: "bpi_master_key" }),
            onload: function (response) {
                let resData = {};
                try { resData = JSON.parse(response.responseText); } catch (e) { }

                if (response.status === 200) {
                    log(`BAŞARILI! Sunucu: ${resData.message || 'Veri alındı.'}`, "success");

                    let currentScans = parseInt(localStorage.getItem('bpi_total_scans') || '0');
                    localStorage.setItem('bpi_total_scans', (currentScans + 1).toString());
                    updateHUD();

                    triggerNextCycle(timeoutMs);
                } else {
                    log(`HATA: Sunucu ${response.status} kodu döndü. (${resData.message || 'Bilinmeyen hata'})`, "error");
                    triggerNextCycle(10000);
                }
            },
            onerror: function (err) {
                log("Gönderim hatası (GM_xhr): " + err.statusText, "error");
                triggerNextCycle(10000);
            }
        });
    }

    // 6. INITIALIZATION
    window.addEventListener('load', () => {
        createPanel();
        createHUD();
        updateHUD();
        setInterval(updateHUD, 1000); // HUD saniye saniye geri saysın

        if (isAutoPilot) {
            log("Otopilot devrede, işlem başlatılıyor...", "success");
            setTimeout(() => {
                initAutoPilot();
            }, 3000);
        }
    });
})();
