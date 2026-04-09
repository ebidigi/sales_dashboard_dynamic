        let charts = {};
        let currentData = null;
        let selectedProjects = [];
        let selectedMembers = [];

        // 標準進捗モード（yesterday: 前日終了時, today: 本日時点, tomorrow: 明日時点）
        let currentProgressMode = 'today';
        let yesterdayProgress = 0;
        let todayProgress = 0;
        let tomorrowProgress = 0;

        // 分析ページ用
        let analysisData = null;
        let analysisSelectedProjects = [];
        let analysisSelectedMembers = [];
        let analysisChart = null;
        let currentChartType = 'calls';
        let compareMonthEnabled = false;

        const colors = {
            // メインカラー
            primary: '#1155cc',
            primaryCyan: '#00a2da',
            darkNavy: '#082558',

            // ステータスカラー（淡い色）
            success: '#86aaec',       // 青系（達成）
            warning: '#ede07d',       // 黄系（注意）
            danger: '#ef947a',        // 赤系（未達）

            // グラフ用
            call: '#1155cc',          // 架電（メインブルー）
            appo: '#00a2da',          // アポ（シアン）

            // グラデーション用
            blue: {
                light: '#c2d6f9',
                medium: '#86aaec',
                dark: '#1155cc'
            },
            yellow: {
                light: '#f4edb6',
                medium: '#ede07d',
                dark: '#e8d335'
            },
            red: {
                light: '#fecec0',
                medium: '#ef947a',
                dark: '#e04f24'
            }
        };

        const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwG_1cvgfnnNuK9PuhmXJOSeBuS8kFzJbf-R1p0qvySu0BW8GYKJKCKzHJ4Ny11FtkV/exec';

        // 概要タブの表示月管理
        let overviewMonth = null; // null = 当月

        function initOverviewMonth() {
            const now = new Date();
            overviewMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            updateMonthDisplay();
        }

        function updateMonthDisplay() {
            const [y, m] = overviewMonth.split('-');
            document.getElementById('monthDisplay').textContent = `${y}年${parseInt(m)}月`;
            // 未来月は無効化
            const now = new Date();
            const currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            document.getElementById('monthNext').disabled = overviewMonth >= currentYM;
            document.getElementById('monthNext').style.opacity = overviewMonth >= currentYM ? '0.3' : '1';
        }

        function changeOverviewMonth(delta) {
            const [y, m] = overviewMonth.split('-').map(Number);
            let newM = m + delta;
            let newY = y;
            if (newM > 12) { newM = 1; newY++; }
            if (newM < 1) { newM = 12; newY--; }
            const now = new Date();
            const currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            const newYM = newY + '-' + String(newM).padStart(2, '0');
            if (newYM > currentYM) return;
            overviewMonth = newYM;
            updateMonthDisplay();
            loadData();
        }

        // 既存のDOMContentLoadedイベントは下で統合

        async function loadData() {
            const baseUrl = localStorage.getItem('gasApiUrl') || DEFAULT_API_URL;
            const url = overviewMonth ? `${baseUrl}?type=monthly&month=${overviewMonth}` : baseUrl;
            showLoading();
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                currentData = data;
                renderDashboard(data);
                document.getElementById('mainContent').style.display = 'block';
                document.getElementById('lastUpdated').textContent = `最終更新: ${new Date().toLocaleString('ja-JP')}`;
            } catch (error) {
                document.getElementById('errorMessage').textContent = 'エラー: ' + error.message;
                document.getElementById('errorMessage').style.display = 'block';
            } finally {
                hideLoading();
            }
        }

        function refreshData() {
            const btn = document.getElementById('refreshBtn');
            btn.disabled = true;
            // 現在のタブを維持
            switchTab(localStorage.getItem('activeTab') || 'overview');
            loadData().finally(() => {
                btn.disabled = false;
            });
        }

        function renderDashboard(data) {
            const { metadata, summary, members } = data;

            // 本日時点の標準進捗
            todayProgress = parseFloat(metadata.standardProgress);

            // 経過日数と全稼働日数
            const elapsedDays = parseInt(metadata.elapsedDays) || 0;
            const totalDays = parseInt(metadata.totalDays) || 1;

            // 前日終了時点の標準進捗を計算
            yesterdayProgress = Math.max(0, parseFloat(((elapsedDays - 1) / totalDays * 100).toFixed(2)));

            // 明日時点の標準進捗を計算（100%を超えない）
            tomorrowProgress = Math.min(100, parseFloat(((elapsedDays + 1) / totalDays * 100).toFixed(2)));

            // 現在のモードに応じた標準進捗を使用
            const standardProgress = currentProgressMode === 'today' ? todayProgress :
                                     currentProgressMode === 'yesterday' ? yesterdayProgress : tomorrowProgress;

            const targetMonth = metadata.targetMonth || overviewMonth || '';
            const now = new Date();
            const currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            const isCurrentMonth = targetMonth === currentYM;
            document.getElementById('dateInfo').textContent = isCurrentMonth
                ? `経過 ${metadata.elapsedDays}日 / 全${metadata.totalDays}稼働日`
                : `全${metadata.totalDays}稼働日`;
            document.getElementById('progressBadge').textContent =
                `標準進捗: ${standardProgress}%`;

            // トグルセクションを表示して値を設定
            document.getElementById('progressToggleSection').style.display = 'flex';
            document.getElementById('yesterdayProgressValue').textContent = `${yesterdayProgress}%`;
            document.getElementById('todayProgressValue').textContent = `${todayProgress}%`;
            document.getElementById('tomorrowProgressValue').textContent = `${tomorrowProgress}%`;

            renderSalesTarget(summary, members);
            renderKPISummary(summary, standardProgress);
            renderAnalysis(members, summary, standardProgress);
            renderFilters(members);
            renderMemberCards(members, standardProgress);
            renderCharts(members, standardProgress);
        }

        function renderSalesTarget(summary, members) {
            // monthly APIレスポンスに含まれるsalesTargetを使用
            let teamTarget = summary.salesTarget || 12500000;
            const currentSales = summary.totalSales;
            const rate = teamTarget > 0 ? Math.round(currentSales / teamTarget * 1000) / 10 : 0;
            const barWidth = Math.min(rate, 100);
            const barColor = rate >= 100 ? '#4ade80' : rate >= 80 ? '#facc15' : '#f87171';
            const remaining = teamTarget - currentSales;

            document.getElementById('salesTargetCard').innerHTML = `
                <div>
                    <div class="sales-target-label">チーム売上</div>
                    <div class="sales-target-amount">¥${currentSales.toLocaleString()}</div>
                </div>
                <div class="sales-target-bar-wrap">
                    <div class="sales-target-bar-info">
                        <span>達成率 ${rate}%</span>
                        <span>目標 ¥${teamTarget.toLocaleString()}</span>
                    </div>
                    <div class="sales-target-bar">
                        <div class="sales-target-bar-fill" style="width:${barWidth}%; background:${barColor};"></div>
                    </div>
                </div>
                <div class="sales-target-right">
                    <div class="sales-target-item">
                        <div class="sales-target-item-label">残り</div>
                        <div class="sales-target-item-value" style="color:${remaining > 0 ? '#f87171' : '#4ade80'}">
                            ${remaining > 0 ? '¥' + remaining.toLocaleString() : '達成!'}
                        </div>
                    </div>
                </div>
            `;
        }

        function renderKPISummary(summary, standardProgress) {
            const callStatus = getStatus(summary.callProgressRate, standardProgress);
            const appoStatus = getStatus(summary.appointmentProgressRate, standardProgress);
            const diff = (summary.appointmentProgressRate - standardProgress).toFixed(1);

            document.getElementById('kpiSummary').innerHTML = `
                <div class="kpi-box highlight">
                    <div class="kpi-label">標準進捗</div>
                    <div class="kpi-value">${standardProgress}%</div>
                    <div class="kpi-detail">経過日数ベース</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-label">架電進捗</div>
                    <div class="kpi-value ${callStatus}">${summary.callProgressRate}%</div>
                    <div class="kpi-detail">${summary.totalCalls.toLocaleString()} / ${summary.targetCalls.toLocaleString()}件</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-label">アポ進捗</div>
                    <div class="kpi-value ${appoStatus}">${summary.appointmentProgressRate}%</div>
                    <div class="kpi-detail">${summary.totalAppointments} / ${summary.targetAppointments}件</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-label">進捗差分</div>
                    <div class="kpi-value ${appoStatus}">${diff >= 0 ? '+' : ''}${diff}%</div>
                    <div class="kpi-detail">アポ - 標準</div>
                </div>
            `;
        }

        function getDisplayName(member) {
            return `${member.name}（${member.project}）`;
        }

        function renderAnalysis(members, summary, standardProgress) {
            if (!members || members.length === 0) {
                document.getElementById('analysisSection').innerHTML = '';
                return;
            }

            const aboveStandard = members.filter(m => m.appointmentProgress >= standardProgress);
            const belowStandard = members.filter(m => m.appointmentProgress < standardProgress);
            const topPerformer = [...members].sort((a, b) => b.appointmentProgress - a.appointmentProgress)[0];
            const needsAttention = [...members].sort((a, b) => a.appointmentProgress - b.appointmentProgress)[0];

            const overallBadge = summary.appointmentProgressRate >= standardProgress ? 'success' :
                                 summary.appointmentProgressRate >= standardProgress * 0.8 ? 'warning' : 'danger';

            document.getElementById('analysisSection').innerHTML = `
                <div class="section-title">進捗サマリー</div>
                <div class="analysis-grid">
                    <div class="analysis-card">
                        <div class="card-title">
                            全体状況
                            <span class="badge ${overallBadge}">${overallBadge === 'success' ? '順調' : overallBadge === 'warning' ? '要注意' : '遅延'}</span>
                        </div>
                        <div class="card-content">
                            標準${standardProgress}%に対しアポ${summary.appointmentProgressRate}%
                        </div>
                    </div>
                    <div class="analysis-card">
                        <div class="card-title">達成状況</div>
                        <div class="card-content">
                            達成 <strong>${aboveStandard.length}名</strong> / 未達 <strong>${belowStandard.length}名</strong>
                        </div>
                    </div>
                    <div class="analysis-card">
                        <div class="card-title">
                            トップ
                            <span class="badge success">TOP</span>
                        </div>
                        <div class="card-content">
                            ${getDisplayName(topPerformer)}：${topPerformer.appointmentProgress}%
                        </div>
                    </div>
                    <div class="analysis-card">
                        <div class="card-title">
                            要フォロー
                            <span class="badge danger">注意</span>
                        </div>
                        <div class="card-content">
                            ${getDisplayName(needsAttention)}：${needsAttention.appointmentProgress}%
                        </div>
                    </div>
                </div>
            `;
        }

        function renderFilters(members) {
            const projects = [...new Set(members.map(m => m.project))];
            const allNames = [...new Set(members.map(m => m.name))];

            // 案件→担当者のマッピング
            const projectMemberMap = {};
            members.forEach(m => {
                if (!projectMemberMap[m.project]) {
                    projectMemberMap[m.project] = new Set();
                }
                projectMemberMap[m.project].add(m.name);
            });

            // 担当者→案件のマッピング
            const memberProjectMap = {};
            members.forEach(m => {
                if (!memberProjectMap[m.name]) {
                    memberProjectMap[m.name] = new Set();
                }
                memberProjectMap[m.name].add(m.project);
            });

            window.projectList = projects;
            window.allNameList = allNames;
            window.projectMemberMap = projectMemberMap;
            window.memberProjectMap = memberProjectMap;
            window.allMembers = members;

            updateFilterUI();
        }

        function updateFilterUI() {
            const filterSection = document.getElementById('filterSection');

            // 双方向連動: どちらを先に選んでも対応
            let availableProjects = new Set(window.projectList);
            let availableMembers = new Set(window.allNameList);

            // 担当者が選択されている場合、その担当者が属する案件のみ表示
            if (selectedMembers.length > 0) {
                availableProjects = new Set();
                selectedMembers.forEach(m => {
                    if (window.memberProjectMap[m]) {
                        window.memberProjectMap[m].forEach(p => availableProjects.add(p));
                    }
                });
            }

            // 案件が選択されている場合、その案件の担当者のみ表示
            if (selectedProjects.length > 0) {
                availableMembers = new Set();
                selectedProjects.forEach(p => {
                    if (window.projectMemberMap[p]) {
                        window.projectMemberMap[p].forEach(name => availableMembers.add(name));
                    }
                });
            }

            const availableProjectList = [...availableProjects];
            const availableMemberList = [...availableMembers];

            // 選択された項目が利用可能リストにない場合は除外
            selectedProjects = selectedProjects.filter(p => availableProjects.has(p));
            selectedMembers = selectedMembers.filter(m => availableMembers.has(m));

            const hasSelection = selectedProjects.length > 0 || selectedMembers.length > 0;
            const projectHint = selectedMembers.length > 0 ? '（選択担当者の案件のみ）' : '';
            const memberHint = selectedProjects.length > 0 ? '（選択案件の担当者のみ）' : '';

            filterSection.innerHTML = `
                <div class="filter-group-label">案件で絞り込み${projectHint}</div>
                <div class="filter-row" id="projectFilterRow">
                    ${availableProjectList.map(p => `
                        <button class="filter-btn ${selectedProjects.includes(p) ? 'active' : ''}"
                                data-type="project" data-value="${p}">${p}</button>
                    `).join('')}
                </div>

                <div class="filter-group-label">担当者で絞り込み${memberHint}</div>
                <div class="filter-row" id="memberFilterRow">
                    ${availableMemberList.map(n => `
                        <button class="filter-btn ${selectedMembers.includes(n) ? 'active' : ''}"
                                data-type="member" data-value="${n}">${n}</button>
                    `).join('')}
                </div>

                <div class="selected-tags ${hasSelection ? '' : 'empty'}" id="selectedTags">
                    ${selectedProjects.map(p => `
                        <span class="tag project" data-type="project" data-value="${p}">
                            ${p}
                            <span class="tag-remove" onclick="removeTag('project', '${p}')">&times;</span>
                        </span>
                    `).join('')}
                    ${selectedMembers.map(m => `
                        <span class="tag member" data-type="member" data-value="${m}">
                            ${m}
                            <span class="tag-remove" onclick="removeTag('member', '${m}')">&times;</span>
                        </span>
                    `).join('')}
                    ${hasSelection ? '<button class="clear-all-btn" onclick="clearAllFilters()">クリア</button>' : ''}
                </div>
            `;

            // Add click handlers
            filterSection.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const type = this.dataset.type;
                    const value = this.dataset.value;
                    toggleFilter(type, value);
                });
            });

            applyFilters();
        }

        function toggleFilter(type, value) {
            if (type === 'project') {
                if (selectedProjects.includes(value)) {
                    selectedProjects = selectedProjects.filter(p => p !== value);
                } else {
                    selectedProjects.push(value);
                }
            } else {
                if (selectedMembers.includes(value)) {
                    selectedMembers = selectedMembers.filter(m => m !== value);
                } else {
                    selectedMembers.push(value);
                }
            }
            updateFilterUI();
        }

        function removeTag(type, value) {
            if (type === 'project') {
                selectedProjects = selectedProjects.filter(p => p !== value);
            } else {
                selectedMembers = selectedMembers.filter(m => m !== value);
            }
            updateFilterUI();
        }

        function clearAllFilters() {
            selectedProjects = [];
            selectedMembers = [];
            updateFilterUI();
        }

        function applyFilters() {
            let filtered = currentData.members;

            if (selectedProjects.length > 0) {
                filtered = filtered.filter(m => selectedProjects.includes(m.project));
            }
            if (selectedMembers.length > 0) {
                filtered = filtered.filter(m => selectedMembers.includes(m.name));
            }

            const standardProgress = currentProgressMode === 'today' ? todayProgress :
                                     currentProgressMode === 'yesterday' ? yesterdayProgress : tomorrowProgress;
            renderMemberCards(filtered, standardProgress);
            renderCharts(filtered, standardProgress);
        }

        function toggleProgressMode(mode) {
            currentProgressMode = mode;

            // ボタンのアクティブ状態を更新
            document.querySelectorAll('.progress-toggle-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });

            // 標準進捗バッジを更新
            const standardProgress = mode === 'today' ? todayProgress :
                                     mode === 'yesterday' ? yesterdayProgress : tomorrowProgress;
            document.getElementById('progressBadge').textContent = `標準進捗: ${standardProgress}%`;

            // データがあれば再描画
            if (currentData) {
                const { summary, members } = currentData;
                renderKPISummary(summary, standardProgress);
                renderAnalysis(members, summary, standardProgress);
                applyFilters(); // フィルター適用済みの状態で再描画
            }
        }

        function renderMemberCards(members, standardProgress) {
            if (!members || members.length === 0) {
                document.getElementById('memberGrid').innerHTML = '<p style="color: var(--text-light); padding: 20px;">該当するデータがありません</p>';
                return;
            }

            const sorted = [...members].sort((a, b) => b.appointmentProgress - a.appointmentProgress);

            document.getElementById('memberGrid').innerHTML = sorted.map(m => {
                // 目標が0の場合、実績が1以上あれば100%達成とみなす
                const effectiveCallProgress = (m.targetCalls === 0 && m.actualCalls > 0) ? 100 : m.callProgress;
                const effectiveAppoProgress = (m.targetAppointments === 0 && m.actualAppointments > 0) ? 100 : m.appointmentProgress;

                const callStatus = getStatus(effectiveCallProgress, standardProgress);
                const appoStatus = getStatus(effectiveAppoProgress, standardProgress);

                // 標準進捗との乖離を計算（実数）
                const expectedCalls = Math.round(m.targetCalls * standardProgress / 100);
                const callDeviation = m.actualCalls - expectedCalls;
                const expectedAppo = Math.round(m.targetAppointments * standardProgress / 100);
                const appoDeviation = m.actualAppointments - expectedAppo;

                // 乖離の表示フォーマット
                const formatDeviation = (dev) => {
                    if (dev > 0) return `<span class="deviation positive">+${dev}</span>`;
                    if (dev < 0) return `<span class="deviation negative">${dev}</span>`;
                    return `<span class="deviation neutral">±0</span>`;
                };

                return `
                    <div class="member-card">
                        <div class="member-header">
                            <span class="member-name">${m.name}（${m.project}）</span>
                        </div>
                        <div class="progress-row">
                            <span class="progress-label">架電</span>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="fill ${callStatus}" style="width: ${Math.min(effectiveCallProgress, 100)}%;"></div>
                                    <div class="target-line" style="left: ${standardProgress}%;"></div>
                                </div>
                            </div>
                            <span class="progress-value ${callStatus}">${effectiveCallProgress}%</span>
                        </div>
                        <div class="progress-row">
                            <span class="progress-label">アポ</span>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="fill ${appoStatus}" style="width: ${Math.min(effectiveAppoProgress, 100)}%;"></div>
                                    <div class="target-line" style="left: ${standardProgress}%;"></div>
                                </div>
                            </div>
                            <span class="progress-value ${appoStatus}">${effectiveAppoProgress}%</span>
                        </div>
                        <div class="stats-row">
                            <div class="stat-item">
                                <div class="stat-label">架電数</div>
                                <div class="stat-value">${m.actualCalls}/${m.targetCalls}</div>
                                <div class="stat-deviation">${formatDeviation(callDeviation)}</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">アポ数</div>
                                <div class="stat-value">${m.actualAppointments}/${m.targetAppointments}</div>
                                <div class="stat-deviation">${formatDeviation(appoDeviation)}</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">架電toアポ</div>
                                <div class="stat-value">${m.callToAppointmentActual}%</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderCharts(members, standardProgress) {
            Object.values(charts).forEach(c => c.destroy());
            charts = {};

            // データがない場合は空のチャートを表示しない
            if (!members || members.length === 0) {
                return;
            }

            // 案件別に集約
            const projectData = {};
            members.forEach(m => {
                if (!projectData[m.project]) {
                    projectData[m.project] = { totalCalls: 0, targetCalls: 0, totalAppo: 0, targetAppo: 0 };
                }
                projectData[m.project].totalCalls += m.actualCalls;
                projectData[m.project].targetCalls += m.targetCalls;
                projectData[m.project].totalAppo += m.actualAppointments;
                projectData[m.project].targetAppo += m.targetAppointments;
            });

            const projectLabels = Object.keys(projectData);
            const projectCallProgress = projectLabels.map(p => {
                if (projectData[p].targetCalls === 0) {
                    return projectData[p].totalCalls > 0 ? 100 : 0;
                }
                return Math.round((projectData[p].totalCalls / projectData[p].targetCalls) * 1000) / 10;
            });
            const projectAppoProgress = projectLabels.map(p => {
                if (projectData[p].targetAppo === 0) {
                    return projectData[p].totalAppo > 0 ? 100 : 0;
                }
                return Math.round((projectData[p].totalAppo / projectData[p].targetAppo) * 1000) / 10;
            });

            charts.compare = new Chart(document.getElementById('progressCompareChart'), {
                type: 'bar',
                data: {
                    labels: projectLabels,
                    datasets: [
                        { label: '架電進捗', data: projectCallProgress, backgroundColor: colors.call, borderRadius: 4 },
                        { label: 'アポ進捗', data: projectAppoProgress, backgroundColor: colors.appo, borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } },
                        annotation: {
                            annotations: {
                                line1: {
                                    type: 'line',
                                    yMin: standardProgress,
                                    yMax: standardProgress,
                                    borderColor: colors.darkNavy,
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    label: { display: true, content: `標準 ${standardProgress}%`, position: 'end', color: '#fff', backgroundColor: colors.darkNavy, font: { family: "'Poppins', sans-serif" } }
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        x: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });

            // 個人別に集約
            const memberData = {};
            members.forEach(m => {
                const name = m.name;
                if (!memberData[name]) {
                    memberData[name] = { totalCalls: 0, targetCalls: 0, totalAppo: 0, targetAppo: 0 };
                }
                memberData[name].totalCalls += m.actualCalls;
                memberData[name].targetCalls += m.targetCalls;
                memberData[name].totalAppo += m.actualAppointments;
                memberData[name].targetAppo += m.targetAppointments;
            });

            const memberLabels = Object.keys(memberData);
            const memberCallProgress = memberLabels.map(n => {
                if (memberData[n].targetCalls === 0) {
                    return memberData[n].totalCalls > 0 ? 100 : 0;
                }
                return Math.round((memberData[n].totalCalls / memberData[n].targetCalls) * 1000) / 10;
            });
            const memberAppoProgress = memberLabels.map(n => {
                if (memberData[n].targetAppo === 0) {
                    return memberData[n].totalAppo > 0 ? 100 : 0;
                }
                return Math.round((memberData[n].totalAppo / memberData[n].targetAppo) * 1000) / 10;
            });

            charts.memberCompare = new Chart(document.getElementById('memberProgressCompareChart'), {
                type: 'bar',
                data: {
                    labels: memberLabels,
                    datasets: [
                        { label: '架電進捗', data: memberCallProgress, backgroundColor: colors.call, borderRadius: 4 },
                        { label: 'アポ進捗', data: memberAppoProgress, backgroundColor: colors.appo, borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } },
                        annotation: {
                            annotations: {
                                line1: {
                                    type: 'line',
                                    yMin: standardProgress,
                                    yMax: standardProgress,
                                    borderColor: colors.darkNavy,
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    label: { display: true, content: `標準 ${standardProgress}%`, position: 'end', color: '#fff', backgroundColor: colors.darkNavy, font: { family: "'Poppins', sans-serif" } }
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        x: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });

            const memberCallRankData = memberLabels.map((n, i) => ({ name: n, progress: memberCallProgress[i] })).sort((a, b) => b.progress - a.progress);
            const memberAppoRankData = memberLabels.map((n, i) => ({ name: n, progress: memberAppoProgress[i] })).sort((a, b) => b.progress - a.progress);

            charts.memberCallRank = new Chart(document.getElementById('memberCallRankChart'), {
                type: 'bar',
                data: {
                    labels: memberCallRankData.map(d => d.name),
                    datasets: [{ data: memberCallRankData.map(d => d.progress), backgroundColor: memberCallRankData.map(d => getStatusColor(d.progress, standardProgress)), borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        y: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });

            charts.memberAppoRank = new Chart(document.getElementById('memberAppoRankChart'), {
                type: 'bar',
                data: {
                    labels: memberAppoRankData.map(d => d.name),
                    datasets: [{ data: memberAppoRankData.map(d => d.progress), backgroundColor: memberAppoRankData.map(d => getStatusColor(d.progress, standardProgress)), borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        y: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });

            // 案件別ランキングデータ
            const callRankData = projectLabels.map((p, i) => ({ name: p, progress: projectCallProgress[i] })).sort((a, b) => b.progress - a.progress);
            const appoRankData = projectLabels.map((p, i) => ({ name: p, progress: projectAppoProgress[i] })).sort((a, b) => b.progress - a.progress);

            charts.callRank = new Chart(document.getElementById('callRankChart'), {
                type: 'bar',
                data: {
                    labels: callRankData.map(d => d.name),
                    datasets: [{ data: callRankData.map(d => d.progress), backgroundColor: callRankData.map(d => getStatusColor(d.progress, standardProgress)), borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        y: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });

            charts.appoRank = new Chart(document.getElementById('appoRankChart'), {
                type: 'bar',
                data: {
                    labels: appoRankData.map(d => d.name),
                    datasets: [{ data: appoRankData.map(d => d.progress), backgroundColor: appoRankData.map(d => getStatusColor(d.progress, standardProgress)), borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: '#e4e8ef' }, ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } } },
                        y: { grid: { display: false }, ticks: { color: '#787b7f', font: { family: "'Noto Sans JP', sans-serif" } } }
                    }
                }
            });
        }

        function getStatus(value, standard) {
            if (value >= standard) return 'success';
            if (value >= standard * 0.8) return 'warning';
            return 'danger';
        }

        function getStatusColor(value, standard) {
            if (value >= standard) return colors.success;
            if (value >= standard * 0.8) return colors.warning;
            return colors.danger;
        }

        function showLoading() {
            document.getElementById('loadingOverlay').classList.remove('hidden');
        }

        function hideLoading() {
            document.getElementById('loadingOverlay').classList.add('hidden');
        }

        // ========================================
        // タブナビゲーション
        // ========================================

        function initTabs() {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const tabId = this.dataset.tab;
                    switchTab(tabId);
                });
            });
        }

        function switchTab(tabId) {
            localStorage.setItem('activeTab', tabId);
            // サイドバーアイテムの状態更新
            document.querySelectorAll('.sidebar-item').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabId);
            });

            // 全タブコンテンツを非表示
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('analysisContent').style.display = 'none';

            // 比較基準トグルは概要タブのみ表示
            const toggleSection = document.getElementById('progressToggleSection');
            if (toggleSection) {
                toggleSection.style.display = tabId === 'overview' ? 'flex' : 'none';
            }

            if (tabId === 'overview') {
                document.getElementById('mainContent').style.display = 'block';
            } else if (tabId === 'analysis') {
                document.getElementById('analysisContent').style.display = 'block';
                loadAnalysisData();
            }
        }

        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.querySelector('.main-content');
            const toggleIcon = document.getElementById('toggleIcon');
            sidebar.classList.toggle('collapsed');

            // メインコンテンツのマージンを調整
            if (sidebar.classList.contains('collapsed')) {
                toggleIcon.innerHTML = '<path d="M9 18l6-6-6-6"/>';
                mainContent.style.marginLeft = '50px';
            } else {
                toggleIcon.innerHTML = '<path d="M15 18l-6-6 6-6"/>';
                mainContent.style.marginLeft = '220px';
            }
        }

        // ========================================
        // 分析ページ
        // ========================================

        const ANALYSIS_CACHE_KEY = 'analysisDataCache';
        const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5分間キャッシュ有効

        function getCacheKey(startDate, endDate) {
            return `${startDate || 'all'}_${endDate || 'all'}`;
        }

        function getAnalysisCache(cacheKey) {
            try {
                const cacheStr = localStorage.getItem(ANALYSIS_CACHE_KEY);
                if (!cacheStr) return null;
                const cache = JSON.parse(cacheStr);
                if (cache.key === cacheKey && Date.now() - cache.timestamp < CACHE_EXPIRY_MS) {
                    return cache.data;
                }
            } catch (e) {
                console.error('Cache read error:', e);
            }
            return null;
        }

        function setAnalysisCache(cacheKey, data) {
            try {
                const cache = {
                    key: cacheKey,
                    timestamp: Date.now(),
                    data: data
                };
                localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
            } catch (e) {
                console.error('Cache write error:', e);
            }
        }

        async function loadAnalysisData(forceRefresh = false) {
            const url = localStorage.getItem('gasApiUrl');
            const startDate = document.getElementById('analysisStartDate').value;
            const endDate = document.getElementById('analysisEndDate').value;
            const cacheKey = getCacheKey(startDate, endDate);

            // キャッシュがあれば即座に表示
            const cachedData = getAnalysisCache(cacheKey);
            if (cachedData && !forceRefresh) {
                analysisData = cachedData;
                renderAnalysisPage();
                console.log('Analysis data loaded from cache');
                // バックグラウンドで最新データを取得
                fetchAnalysisDataInBackground(url, startDate, endDate, cacheKey);
                return;
            }

            let apiUrl = `${url}?type=rawdata`;
            if (startDate) apiUrl += `&startDate=${startDate}`;
            if (endDate) apiUrl += `&endDate=${endDate}`;

            showLoading();
            try {
                const response = await fetch(apiUrl);
                analysisData = await response.json();
                if (analysisData.error) throw new Error(analysisData.error);
                setAnalysisCache(cacheKey, analysisData);
                renderAnalysisPage();
            } catch (error) {
                console.error('Analysis data load error:', error);
                document.getElementById('analysisNumberKPIs').innerHTML = '<p style="color: var(--text-light);">データの読み込みに失敗しました</p>';
            } finally {
                hideLoading();
            }
        }

        async function fetchAnalysisDataInBackground(url, startDate, endDate, cacheKey) {
            let apiUrl = `${url}?type=rawdata`;
            if (startDate) apiUrl += `&startDate=${startDate}`;
            if (endDate) apiUrl += `&endDate=${endDate}`;

            try {
                const response = await fetch(apiUrl);
                const newData = await response.json();
                if (!newData.error) {
                    analysisData = newData;
                    setAnalysisCache(cacheKey, newData);
                    renderAnalysisPage();
                    console.log('Analysis data updated from background fetch');
                }
            } catch (error) {
                console.error('Background fetch error:', error);
            }
        }

        function renderAnalysisPage() {
            if (!analysisData) return;

            renderAnalysisFilters();
            renderAnalysisKPIs();
            renderAnalysisChart();
            initChartTypeSelector();
        }

        function renderAnalysisFilters() {
            // 概要ページと同じデータソース（月次ビュー）を使用
            if (!currentData || !currentData.members) {
                console.error('No current data available');
                return;
            }

            // 月次ビューから案件と担当者を取得
            const projects = [...new Set(currentData.members.map(m => m.project))];
            const members = [...new Set(currentData.members.map(m => m.name))];

            // 案件→担当者のマッピング
            const projectMemberMap = {};
            currentData.members.forEach(m => {
                if (!projectMemberMap[m.project]) {
                    projectMemberMap[m.project] = new Set();
                }
                projectMemberMap[m.project].add(m.name);
            });

            // 担当者→案件のマッピング
            const memberProjectMap = {};
            currentData.members.forEach(m => {
                if (!memberProjectMap[m.name]) {
                    memberProjectMap[m.name] = new Set();
                }
                memberProjectMap[m.name].add(m.project);
            });

            // 双方向連動フィルター
            let availableProjects = new Set(projects);
            let availableMembers = new Set(members);

            // 担当者が選択されている場合
            if (analysisSelectedMembers.length > 0) {
                availableProjects = new Set();
                analysisSelectedMembers.forEach(m => {
                    if (memberProjectMap[m]) {
                        memberProjectMap[m].forEach(p => availableProjects.add(p));
                    }
                });
            }

            // 案件が選択されている場合
            if (analysisSelectedProjects.length > 0) {
                availableMembers = new Set();
                analysisSelectedProjects.forEach(p => {
                    if (projectMemberMap[p]) {
                        projectMemberMap[p].forEach(name => availableMembers.add(name));
                    }
                });
            }

            const availableProjectList = [...availableProjects];
            const availableMemberList = [...availableMembers];

            // フィルタリング
            analysisSelectedProjects = analysisSelectedProjects.filter(p => availableProjects.has(p));
            analysisSelectedMembers = analysisSelectedMembers.filter(m => availableMembers.has(m));

            const hasSelection = analysisSelectedProjects.length > 0 || analysisSelectedMembers.length > 0;

            document.getElementById('analysisProjectFilterRow').innerHTML = availableProjectList.map(p => `
                <button class="filter-btn ${analysisSelectedProjects.includes(p) ? 'active' : ''}"
                        onclick="toggleAnalysisFilter('project', '${p}')">${p}</button>
            `).join('');

            document.getElementById('analysisMemberFilterRow').innerHTML = availableMemberList.map(m => `
                <button class="filter-btn ${analysisSelectedMembers.includes(m) ? 'active' : ''}"
                        onclick="toggleAnalysisFilter('member', '${m}')">${m}</button>
            `).join('');

            const tagsContainer = document.getElementById('analysisSelectedTags');
            tagsContainer.className = hasSelection ? 'selected-tags' : 'selected-tags empty';
            tagsContainer.innerHTML = `
                ${analysisSelectedProjects.map(p => `
                    <span class="tag project">
                        ${p}
                        <span class="tag-remove" onclick="removeAnalysisTag('project', '${p}')">&times;</span>
                    </span>
                `).join('')}
                ${analysisSelectedMembers.map(m => `
                    <span class="tag member">
                        ${m}
                        <span class="tag-remove" onclick="removeAnalysisTag('member', '${m}')">&times;</span>
                    </span>
                `).join('')}
                ${hasSelection ? '<button class="clear-all-btn" onclick="clearAnalysisFilters()">クリア</button>' : ''}
            `;
        }

        function toggleAnalysisFilter(type, value) {
            if (type === 'project') {
                if (analysisSelectedProjects.includes(value)) {
                    analysisSelectedProjects = analysisSelectedProjects.filter(p => p !== value);
                } else {
                    analysisSelectedProjects.push(value);
                }
            } else {
                if (analysisSelectedMembers.includes(value)) {
                    analysisSelectedMembers = analysisSelectedMembers.filter(m => m !== value);
                } else {
                    analysisSelectedMembers.push(value);
                }
            }
            renderAnalysisFilters();
            renderAnalysisKPIs();
            renderAnalysisChart();
        }

        function removeAnalysisTag(type, value) {
            if (type === 'project') {
                analysisSelectedProjects = analysisSelectedProjects.filter(p => p !== value);
            } else {
                analysisSelectedMembers = analysisSelectedMembers.filter(m => m !== value);
            }
            renderAnalysisFilters();
            renderAnalysisKPIs();
            renderAnalysisChart();
        }

        function clearAnalysisFilters() {
            analysisSelectedProjects = [];
            analysisSelectedMembers = [];
            renderAnalysisFilters();
            renderAnalysisKPIs();
            renderAnalysisChart();
        }

        function applyAnalysisFilters() {
            // 日付フィルター変更時は強制リフレッシュ
            loadAnalysisData(true);
        }

        function getFilteredAnalysisData() {
            if (!analysisData || !analysisData.records) return { records: [], aggregated: null };

            let filtered = analysisData.records;

            if (analysisSelectedProjects.length > 0) {
                filtered = filtered.filter(r => analysisSelectedProjects.includes(r.project));
            }
            if (analysisSelectedMembers.length > 0) {
                filtered = filtered.filter(r => analysisSelectedMembers.includes(r.name));
            }

            // 再集計
            const aggregated = aggregateFilteredData(filtered);

            return { records: filtered, aggregated: aggregated };
        }

        function aggregateFilteredData(records) {
            let totalCalls = 0, totalPR = 0, totalAppo = 0, totalCallTime = 0;
            const dailyMap = {};

            records.forEach(r => {
                totalCalls += r.calls;
                totalPR += r.pr;
                totalAppo += r.appo;
                totalCallTime += r.callTime;

                if (r.date) {
                    if (!dailyMap[r.date]) {
                        dailyMap[r.date] = { calls: 0, pr: 0, appo: 0, callTime: 0 };
                    }
                    dailyMap[r.date].calls += r.calls;
                    dailyMap[r.date].pr += r.pr;
                    dailyMap[r.date].appo += r.appo;
                    dailyMap[r.date].callTime += r.callTime;
                }
            });

            return {
                totals: {
                    calls: totalCalls,
                    pr: totalPR,
                    appo: totalAppo,
                    callTime: totalCallTime,
                    callToPR: totalCalls > 0 ? Math.round(totalPR / totalCalls * 10000) / 100 : 0,
                    prToAppo: totalPR > 0 ? Math.round(totalAppo / totalPR * 10000) / 100 : 0,
                    callToAppo: totalCalls > 0 ? Math.round(totalAppo / totalCalls * 10000) / 100 : 0,
                    callsPerHour: totalCallTime > 0 ? Math.round(totalCalls / totalCallTime * 10) / 10 : 0
                },
                daily: Object.keys(dailyMap).sort().map(date => ({
                    date: date,
                    ...dailyMap[date],
                    callToPR: dailyMap[date].calls > 0 ? Math.round(dailyMap[date].pr / dailyMap[date].calls * 10000) / 100 : 0,
                    prToAppo: dailyMap[date].pr > 0 ? Math.round(dailyMap[date].appo / dailyMap[date].pr * 10000) / 100 : 0,
                    callToAppo: dailyMap[date].calls > 0 ? Math.round(dailyMap[date].appo / dailyMap[date].calls * 10000) / 100 : 0,
                    callsPerHour: dailyMap[date].callTime > 0 ? Math.round(dailyMap[date].calls / dailyMap[date].callTime * 10) / 10 : 0
                }))
            };
        }

        function renderAnalysisKPIs() {
            const { aggregated } = getFilteredAnalysisData();
            if (!aggregated) return;

            const totals = aggregated.totals;
            const comparisons = analysisData.comparisons || { lastMonth: {}, allTime: {} };

            // 実数指標
            document.getElementById('analysisNumberKPIs').innerHTML = `
                <div class="analysis-kpi-card">
                    <div class="kpi-name">架電数</div>
                    <div class="kpi-main-value">${totals.calls.toLocaleString()}</div>
                </div>
                <div class="analysis-kpi-card">
                    <div class="kpi-name">PR数</div>
                    <div class="kpi-main-value">${totals.pr.toLocaleString()}</div>
                </div>
                <div class="analysis-kpi-card">
                    <div class="kpi-name">アポ数</div>
                    <div class="kpi-main-value">${totals.appo.toLocaleString()}</div>
                </div>
                <div class="analysis-kpi-card">
                    <div class="kpi-name">架電数/H</div>
                    <div class="kpi-main-value">${totals.callsPerHour}</div>
                </div>
            `;

            // 率指標
            document.getElementById('analysisRateKPIs').innerHTML = `
                <div class="analysis-kpi-card">
                    <div class="kpi-name">架電toPR率</div>
                    <div class="kpi-main-value">${totals.callToPR}%</div>
                    <div class="kpi-comparison">
                        <div class="comparison-item">
                            <span class="comparison-label">先月比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.lastMonth.callToPR)}">${formatComparison(comparisons.lastMonth.callToPR)}</span>
                        </div>
                        <div class="comparison-item">
                            <span class="comparison-label">通算比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.allTime.callToPR)}">${formatComparison(comparisons.allTime.callToPR)}</span>
                        </div>
                    </div>
                </div>
                <div class="analysis-kpi-card">
                    <div class="kpi-name">PRtoアポ率</div>
                    <div class="kpi-main-value">${totals.prToAppo}%</div>
                    <div class="kpi-comparison">
                        <div class="comparison-item">
                            <span class="comparison-label">先月比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.lastMonth.prToAppo)}">${formatComparison(comparisons.lastMonth.prToAppo)}</span>
                        </div>
                        <div class="comparison-item">
                            <span class="comparison-label">通算比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.allTime.prToAppo)}">${formatComparison(comparisons.allTime.prToAppo)}</span>
                        </div>
                    </div>
                </div>
                <div class="analysis-kpi-card">
                    <div class="kpi-name">架電toアポ率</div>
                    <div class="kpi-main-value">${totals.callToAppo}%</div>
                    <div class="kpi-comparison">
                        <div class="comparison-item">
                            <span class="comparison-label">先月比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.lastMonth.callToAppo)}">${formatComparison(comparisons.lastMonth.callToAppo)}</span>
                        </div>
                        <div class="comparison-item">
                            <span class="comparison-label">通算比: </span>
                            <span class="comparison-value ${getComparisonClass(comparisons.allTime.callToAppo)}">${formatComparison(comparisons.allTime.callToAppo)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        function getComparisonClass(value) {
            if (!value || value === 0) return 'neutral';
            return value > 0 ? 'positive' : 'negative';
        }

        function formatComparison(value) {
            if (!value || value === 0) return '±0.0%';
            const prefix = value > 0 ? '+' : '';
            return `${prefix}${value.toFixed(1)}%`;
        }

        function initChartTypeSelector() {
            document.querySelectorAll('.chart-type-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentChartType = this.dataset.chart;
                    renderAnalysisChart();
                });
            });
        }

        function toggleMonthCompare() {
            compareMonthEnabled = document.getElementById('compareMonthToggle').checked;

            // 前月比較時は率系のみ表示（架電数/PR数/アポ数を非表示）
            const absoluteCharts = ['calls', 'pr', 'appo'];
            document.querySelectorAll('.chart-type-btn').forEach(btn => {
                const chartType = btn.dataset.chart;
                if (absoluteCharts.includes(chartType)) {
                    btn.style.display = compareMonthEnabled ? 'none' : '';
                }
            });

            // 現在選択中が非表示になった場合、架電toPR率に切り替え
            if (compareMonthEnabled && absoluteCharts.includes(currentChartType)) {
                currentChartType = 'callToPR';
                document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.chart-type-btn[data-chart="callToPR"]').classList.add('active');
            }

            renderAnalysisChart();
        }

        function renderAnalysisChart() {
            const { aggregated } = getFilteredAnalysisData();
            if (!aggregated || !aggregated.daily || aggregated.daily.length === 0) {
                if (analysisChart) {
                    analysisChart.destroy();
                    analysisChart = null;
                }
                return;
            }

            const daily = aggregated.daily;

            // 比較モードの場合は日付を日番号(1-31)に変換
            let labels;
            if (compareMonthEnabled) {
                // 日番号でラベル作成（1日, 2日, ...）
                labels = daily.map(d => {
                    const day = new Date(d.date).getDate();
                    return day + '日';
                });
            } else {
                labels = daily.map(d => d.date);
            }

            let data, label, color, prevData;
            const chartConfig = {
                calls: { label: '架電数', color: colors.call, field: 'calls' },
                pr: { label: 'PR数', color: colors.primaryCyan, field: 'pr' },
                appo: { label: 'アポ数', color: colors.success, field: 'appo' },
                callToPR: { label: '架電toPR率 (%)', color: colors.warning, field: 'callToPR' },
                prToAppo: { label: 'PRtoアポ率 (%)', color: '#00a2da', field: 'prToAppo' },
                callToAppo: { label: '架電toアポ率 (%)', color: '#e04f24', field: 'callToAppo' },
                callsPerHour: { label: '架電数/H', color: colors.danger, field: 'callsPerHour' }
            };

            const config = chartConfig[currentChartType] || chartConfig.calls;
            label = config.label;
            color = config.color;
            data = daily.map(d => d[config.field]);

            // 前月平均値の計算（比較モード時）
            let prevMonthAvg = null;
            if (compareMonthEnabled && analysisData && analysisData.previousMonthDaily) {
                const prevDaily = analysisData.previousMonthDaily.daily;
                // 値がある日だけで平均を計算
                const validValues = prevDaily.filter(d => d[config.field] > 0).map(d => d[config.field]);
                if (validValues.length > 0) {
                    prevMonthAvg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
                    prevMonthAvg = Math.round(prevMonthAvg * 100) / 100;
                }
            }

            if (analysisChart) {
                analysisChart.destroy();
            }

            const ctx = document.getElementById('analysisDailyChart').getContext('2d');
            const datasets = [{
                label: compareMonthEnabled ? '当月 ' + label : label,
                data: data,
                borderColor: color,
                backgroundColor: color + '20',
                fill: !compareMonthEnabled,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: color
            }];

            // 比較モード時に前月平均を水平線で追加
            if (compareMonthEnabled && prevMonthAvg !== null) {
                datasets.push({
                    label: '前月平均 ' + config.label + ' (' + prevMonthAvg + ')',
                    data: Array(data.length).fill(prevMonthAvg),
                    borderColor: '#e04f24',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [8, 4]
                });
            }

            analysisChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#787b7f',
                                font: { family: "'Noto Sans JP', sans-serif" }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#e4e8ef' },
                            ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#787b7f', font: { family: "'Poppins', sans-serif" } }
                        }
                    }
                }
            });
        }

        // ========================================
        // 設定ページ
        // ========================================

        // 初期化時にタブを設定
        document.addEventListener('DOMContentLoaded', function() {
            if (!localStorage.getItem('gasApiUrl')) {
                localStorage.setItem('gasApiUrl', DEFAULT_API_URL);
            }
            initTabs();
            initOverviewMonth();
            const urlTab = new URLSearchParams(window.location.search).get('tab');
            switchTab(urlTab || localStorage.getItem('activeTab') || 'overview');

            // デフォルトの日付範囲を設定（今月）
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            document.getElementById('analysisStartDate').value = formatDateInput(firstDay);
            document.getElementById('analysisEndDate').value = formatDateInput(today);

            loadData();
        });

        function formatDateInput(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
