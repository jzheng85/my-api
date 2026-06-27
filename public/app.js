let token = localStorage.getItem('token');
let user = null;
let selectedBet = null;

async function apiRequest(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    return response;
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showAlert('请输入用户名和密码', 'error');
        return;
    }

    try {
        const response = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            token = data.token;
            user = { id: data.id, username: data.username, points: data.points };
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            showMainContent();
            showAlert('登录成功！', 'success');
            loadMatches();
            updateUserInfo();
        } else {
            const error = await response.json();
            showAlert(error.error, 'error');
        }
    } catch (error) {
        showAlert('登录失败，请稍后重试', 'error');
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const inviteCode = document.getElementById('registerInviteCode').value;

    if (!username || !password || !inviteCode) {
        showAlert('请输入用户名、密码和邀请码', 'error');
        return;
    }

    if (password.length < 6) {
        showAlert('密码至少需要6位', 'error');
        return;
    }

    try {
        const response = await apiRequest('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, inviteCode })
        });

        if (response.ok) {
            showAlert('注册成功，请登录', 'success');
            setTimeout(showLogin, 1500);
        } else {
            const error = await response.json();
            showAlert(error.error, 'error');
        }
    } catch (error) {
        showAlert('注册失败，请稍后重试', 'error');
    }
}

function logout() {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showLogin();
    showAlert('已退出登录', 'success');
}

function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('registerSection').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
}

function showRegister() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('registerSection').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
}

function showMainContent() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('registerSection').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
}

function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    document.querySelector('.container').insertBefore(alert, document.querySelector('header'));
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('matchesTab').classList.add('hidden');
    document.getElementById('betsTab').classList.add('hidden');
    document.getElementById('transactionsTab').classList.add('hidden');
    document.getElementById('adminTab').classList.add('hidden');

    if (tab === 'matches') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('matchesTab').classList.remove('hidden');
    } else if (tab === 'bets') {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('betsTab').classList.remove('hidden');
        loadBets();
    } else if (tab === 'transactions') {
        document.querySelectorAll('.tab')[2].classList.add('active');
        document.getElementById('transactionsTab').classList.remove('hidden');
        loadTransactions();
    } else if (tab === 'admin') {
        document.querySelectorAll('.tab')[3].classList.add('active');
        document.getElementById('adminTab').classList.remove('hidden');
        loadAdminUsers();
        loadAdminMatches();
    }
}

async function loadMatches() {
    try {
        const response = await apiRequest('/api/matches');
        if (response.ok) {
            const allMatches = await response.json();
            const pendingMatches = allMatches.filter(m => m.match_status !== 'ended');
            renderMatches(pendingMatches);
        } else {
            showAlert('加载比赛失败', 'error');
        }
    } catch (error) {
        showAlert('加载比赛失败', 'error');
    }
}

function renderMatches(matches) {
    const container = document.getElementById('matchesList');
    
    if (matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 48px; margin-bottom: 16px;">⚽</div>
                <h3>暂无比赛数据</h3>
                <p>当前没有可投注的比赛</p>
            </div>
        `;
        return;
    }

    container.innerHTML = matches.map(match => {
        const isEnded = match.match_status === 'ended';
        
        let oddsSection = '';
        let betSection = '';
        
        if (!isEnded) {
            oddsSection = `
                <div class="odds-section">
                    <div class="odds-title">胜平负 (1x2)</div>
                    <div class="odds-grid">
                        <div class="odds-item" onclick="selectOdds('${match.id}', '1x2', 'win', ${match.winOdds})">
                            <div class="odds-label">主胜</div>
                            <div class="odds-value">${match.winOdds}</div>
                        </div>
                        <div class="odds-item" onclick="selectOdds('${match.id}', '1x2', 'draw', ${match.drawOdds})">
                            <div class="odds-label">平局</div>
                            <div class="odds-value">${match.drawOdds}</div>
                        </div>
                        <div class="odds-item" onclick="selectOdds('${match.id}', '1x2', 'lose', ${match.loseOdds})">
                            <div class="odds-label">客胜</div>
                            <div class="odds-value">${match.loseOdds}</div>
                        </div>
                    </div>
                </div>
                
                ${match.handicap ? `
                <div class="odds-section">
                    <div class="odds-title">让球 (AH)</div>
                    <div class="odds-grid">
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ah', 'home', ${match.handicapHomeOdds})">
                            <div class="odds-label">主队</div>
                            <div class="odds-value">${match.handicapHomeOdds}</div>
                        </div>
                        <div class="odds-handicap">
                            <div class="handicap-value">${match.handicap}</div>
                        </div>
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ah', 'away', ${match.handicapAwayOdds})">
                            <div class="odds-label">客队</div>
                            <div class="odds-value">${match.handicapAwayOdds}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                ${match.totalGoals ? `
                <div class="odds-section">
                    <div class="odds-title">大小球 (OU)</div>
                    <div class="odds-grid">
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ou', 'over', ${match.overOdds})">
                            <div class="odds-label">大球</div>
                            <div class="odds-value">${match.overOdds}</div>
                        </div>
                        <div class="odds-handicap">
                            <div class="handicap-value">${match.totalGoals}</div>
                        </div>
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ou', 'under', ${match.underOdds})">
                            <div class="odds-label">小球</div>
                            <div class="odds-value">${match.underOdds}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
            `;
            
            betSection = `
                <div class="bet-section" id="betSection-${match.id}">
                    <div class="bet-input">
                        <input type="number" id="betPoints-${match.id}" placeholder="输入投注积分" min="1">
                        <button class="btn btn-primary" onclick="placeBet('${match.id}')">确认投注</button>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="match-card">
                <div class="match-header">
                    <span class="match-league">${match.league}</span>
                    <span class="match-status status-${match.match_status}">
                        ${match.match_status === 'pending' ? '未开始' : match.match_status === 'live' ? '进行中' : '已结束'}
                    </span>
                </div>
                <div class="match-teams">
                    <div class="team">
                        <div class="team-name">${match.homeTeam}</div>
                    </div>
                    <div class="match-score">${match.score || '-'}</div>
                    <div class="team">
                        <div class="team-name">${match.awayTeam}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px; font-size: 12px; color: rgba(255,255,255,0.5);">
                    比赛时间: ${match.match_time || '-'}
                </div>

                ${oddsSection}
                
                ${isEnded ? '<div style="text-align: center; color: #9ca3af; padding: 10px;">比赛已结束，无法投注</div>' : ''}
                
                ${betSection}
            </div>
        `;
    }).join('');
}

function selectOdds(matchId, betType, betValue, odds) {
    document.querySelectorAll('.odds-item').forEach(item => item.classList.remove('selected'));
    
    selectedBet = {
        matchId,
        betType,
        betValue,
        odds
    };
    
    const activeItem = document.querySelector(`.odds-item[onclick="selectOdds('${matchId}', '${betType}', '${betValue}', ${odds})"]`);
    if (activeItem) {
        activeItem.classList.add('selected');
    }
}

async function placeBet(matchId) {
    if (!selectedBet || selectedBet.matchId !== matchId) {
        showAlert('请先选择赔率', 'error');
        return;
    }

    const pointsInput = document.getElementById(`betPoints-${matchId}`);
    const points = parseInt(pointsInput.value);

    if (!points || points <= 0) {
        showAlert('请输入有效的投注积分', 'error');
        return;
    }

    if (points > user.points) {
        showAlert('积分不足', 'error');
        return;
    }

    try {
        const response = await apiRequest('/api/bets', {
            method: 'POST',
            body: JSON.stringify({
                matchId: selectedBet.matchId,
                betType: selectedBet.betType,
                betValue: selectedBet.betValue,
                points
            })
        });

        if (response.ok) {
            showAlert('投注成功！', 'success');
            pointsInput.value = '';
            selectedBet = null;
            document.querySelectorAll('.odds-item').forEach(item => item.classList.remove('selected'));
            updateUserInfo();
        } else {
            const error = await response.json();
            showAlert(error.error, 'error');
        }
    } catch (error) {
        showAlert('投注失败', 'error');
    }
}

async function loadBets() {
    try {
        const response = await apiRequest('/api/bets');
        if (response.ok) {
            const bets = await response.json();
            renderBets(bets);
        } else {
            showAlert('加载投注记录失败', 'error');
        }
    } catch (error) {
        showAlert('加载投注记录失败', 'error');
    }
}

function renderBets(bets) {
    const container = document.getElementById('betsList');
    
    if (bets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                <h3>暂无投注记录</h3>
                <p>快去投注一场比赛吧</p>
            </div>
        `;
        return;
    }

    container.innerHTML = bets.map(bet => {
        let resultText = '待结算';
        let resultClass = 'bet-pending';
        let payoutText = '';

        if (bet.status === 'won') {
            resultText = '赢';
            resultClass = 'bet-won';
            payoutText = `+${bet.payout} 积分`;
        } else if (bet.status === 'lost') {
            resultText = '输';
            resultClass = 'bet-lost';
        }

        const homeTeam = bet.homeTeam || '未知主队';
        const awayTeam = bet.awayTeam || '未知客队';
        const betTypeText = getBetTypeText(bet.bet_type);
        const betValueText = getBetValueText(bet.bet_value);
        const handicapText = getHandicapText(bet.bet_type, bet.bet_value, bet.handicap_at_bet, bet.total_goals_at_bet);
        const oddsWithPrincipal = (parseFloat(bet.odds_at_bet) + 1).toFixed(2);
        
        let pointsText = '';
        if (bet.status === 'pending') {
            const expectedPayout = Math.round(parseFloat(bet.points) * (parseFloat(bet.odds_at_bet) + 1));
            pointsText = `预计赢 ${expectedPayout} 积分`;
        } else if (bet.status === 'won') {
            pointsText = `赢 ${bet.payout} 积分`;
        } else {
            pointsText = `输 ${bet.points} 积分`;
        }

        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-match">${homeTeam} vs ${awayTeam}</div>
                    <div class="bet-details">
                        ${betTypeText} - ${betValueText}${handicapText ? ` ${handicapText}` : ''}
                    </div>
                    <div class="bet-details" style="margin-top: 4px;">
                        ${bet.points}积分 @ ${oddsWithPrincipal}赔率 | ${pointsText}
                    </div>
                </div>
                <div class="bet-result ${resultClass}">${resultText}</div>
            </div>
        `;
    }).join('');
}

function getBetTypeText(type) {
    const map = {
        '1x2': '胜平负',
        'ah': '让球',
        'ou': '大小球'
    };
    return map[type] || type;
}

function getBetValueText(value) {
    const map = {
        'win': '主胜',
        'draw': '平局',
        'lose': '客胜',
        'home': '主队',
        'away': '客队',
        'over': '大球',
        'under': '小球'
    };
    return map[value] || value;
}

function getHandicapText(betType, betValue, handicap, totalGoals) {
    if (betType === 'ah' && handicap) {
        if (betValue === 'away') {
            const sign = handicap.startsWith('-') ? '+' : '-';
            const num = handicap.replace(/[+-]/g, '');
            return `(${sign}${num})`;
        }
        return `(${handicap})`;
    }
    if (betType === 'ou' && totalGoals) {
        return `(${totalGoals})`;
    }
    return '';
}

async function updateUserInfo() {
    try {
        const response = await apiRequest('/api/user/points');
        if (response.ok) {
            const data = await response.json();
            user.points = data.points;
            user.username = data.username;
            localStorage.setItem('user', JSON.stringify(user));
            document.getElementById('pointsBadge').textContent = data.points;
            document.getElementById('usernameBadge').textContent = `用户: ${user.username}`;
            
            const adminTabBtn = document.getElementById('adminTabBtn');
            if (adminTabBtn) {
                if (user.username === 'admin') {
                    adminTabBtn.style.display = 'block';
                } else {
                    adminTabBtn.style.display = 'none';
                    document.getElementById('adminTab').classList.add('hidden');
                }
            }
        }
    } catch (error) {
        console.error('更新用户信息失败', error);
    }
}

async function loadTransactions() {
    try {
        const response = await apiRequest('/api/user/transactions');
        if (response.ok) {
            const transactions = await response.json();
            renderTransactions(transactions);
        } else {
            showAlert('加载积分明细失败', 'error');
        }
    } catch (error) {
        showAlert('加载积分明细失败', 'error');
    }
}

function renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    
    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                <h3>暂无积分明细</h3>
                <p>您还没有任何积分变动记录</p>
            </div>
        `;
        return;
    }

    container.innerHTML = transactions.map(tx => {
        const typeText = getTransactionTypeText(tx.type);
        const amountClass = tx.amount > 0 ? 'tx-credit' : 'tx-debit';
        const amountText = tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`;
        
        const date = new Date(tx.created_at);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-match">${typeText}</div>
                    <div class="bet-details">
                        ${tx.description || '-'}
                    </div>
                    <div class="bet-details" style="margin-top: 4px;">
                        ${dateStr} | 余额: ${tx.balance_after}
                    </div>
                </div>
                <div class="bet-result ${amountClass}" style="font-size: 16px;">${amountText}</div>
            </div>
        `;
    }).join('');
}

function getTransactionTypeText(type) {
    const map = {
        'register': '注册赠送',
        'bet': '投注扣款',
        'settle_win': '结算赢',
        'settle_lose': '结算输',
        'recharge': '充值'
    };
    return map[type] || type;
}

async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users');
        if (response.ok) {
            const users = await response.json();
            const select = document.getElementById('adminUsername');
            select.innerHTML = '<option value="">请选择用户</option>';
            
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username;
                option.textContent = `${user.username} (积分: ${user.points})`;
                select.appendChild(option);
            });
        } else {
            showAlert('加载用户列表失败', 'error');
        }
    } catch (error) {
        showAlert('加载用户列表失败', 'error');
    }
}

async function adminRecharge() {
    const username = document.getElementById('adminUsername').value;
    const amount = parseInt(document.getElementById('adminRechargeAmount').value);
    const secret = document.getElementById('adminSecret').value;

    if (!username) {
        showAlert('请选择用户', 'error');
        return;
    }

    if (!amount || amount <= 0) {
        showAlert('请输入有效的充值金额', 'error');
        return;
    }

    if (!secret) {
        showAlert('请输入管理密钥', 'error');
        return;
    }

    try {
        const response = await fetch('/api/admin/recharge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, amount, secret })
        });

        if (response.ok) {
            const data = await response.json();
            showAlert(`充值成功！${username} 当前积分: ${data.balanceAfter}`, 'success');
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminRechargeAmount').value = '';
            document.getElementById('adminSecret').value = '';
            document.getElementById('adminUserResult').innerHTML = '';
        } else {
            const error = await response.json();
            showAlert(error.error, 'error');
        }
    } catch (error) {
        showAlert('充值失败', 'error');
    }
}

async function loadAdminMatches() {
    try {
        const response = await apiRequest('/api/matches');
        if (response.ok) {
            const matches = await response.json();
            renderAdminMatches(matches);
        } else {
            showAlert('加载比赛失败', 'error');
        }
    } catch (error) {
        showAlert('加载比赛失败', 'error');
    }
}

function renderAdminMatches(matches) {
    const container = document.getElementById('adminMatchesList');
    
    if (matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 48px; margin-bottom: 16px;">⚽</div>
                <h3>暂无比赛数据</h3>
                <p>当前没有比赛记录</p>
            </div>
        `;
        return;
    }

    container.innerHTML = matches.map(match => {
        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-match">${match.homeTeam} vs ${match.awayTeam}</div>
                    <div class="bet-details">
                        ${match.league} | 当前比分: ${match.score || '-'} | 状态: ${match.match_status === 'pending' ? '未开始' : match.match_status === 'live' ? '进行中' : '已结束'}
                    </div>
                    <div class="bet-details" style="margin-top: 8px;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" id="adminScore-${match.id}" placeholder="输入比分如 2:1" style="padding: 4px 8px; font-size: 12px; width: 120px;">
                            <button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px;" onclick="settleMatch('${match.id}')">结算比赛</button>
                        </div>
                    </div>
                </div>
                <div class="bet-result ${match.match_status === 'ended' ? 'bet-won' : 'bet-pending'}">
                    ${match.match_status === 'ended' ? '已结算' : '待结算'}
                </div>
            </div>
        `;
    }).join('');
}

async function settleMatch(matchId) {
    const scoreInput = document.getElementById(`adminScore-${matchId}`);
    const score = scoreInput.value;
    const secret = document.getElementById('adminSecret').value;

    if (!score || !score.includes(':')) {
        showAlert('请输入有效的比分格式（如 2:1）', 'error');
        return;
    }

    if (!secret) {
        showAlert('请先输入管理密钥', 'error');
        return;
    }

    try {
        const updateResponse = await fetch('/api/admin/settle-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, score, secret })
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.json();
            showAlert(error.error, 'error');
            return;
        }

        const settleResponse = await apiRequest(`/api/bets/settle/${matchId}`, {
            method: 'POST'
        });

        if (settleResponse.ok) {
            showAlert('比赛结算成功！', 'success');
            loadAdminMatches();
        } else {
            const error = await settleResponse.json();
            showAlert(error.error, 'error');
        }
    } catch (error) {
        showAlert('结算失败', 'error');
    }
}

function init() {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    const adminTabBtn = document.getElementById('adminTabBtn');
    if (adminTabBtn) {
        adminTabBtn.style.display = 'none';
    }
    
    if (savedToken && savedUser) {
        token = savedToken;
        user = JSON.parse(savedUser);
        showMainContent();
        updateUserInfo();
        loadMatches();
    } else {
        showLogin();
    }
}

init();