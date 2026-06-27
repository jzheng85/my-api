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

    if (tab === 'matches') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('matchesTab').classList.remove('hidden');
    } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('betsTab').classList.remove('hidden');
        loadBets();
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
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">暂无比赛数据</div>';
        return;
    }

    container.innerHTML = matches.map(match => {
        const isEnded = match.match_status === 'ended';
        
        let oddsSection = '';
        let betSection = '';
        
        if (!isEnded) {
            oddsSection = `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #00d4ff; margin-bottom: 8px;">胜平负 (1x2)</div>
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
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #7c3aed; margin-bottom: 8px;">让球 (AH) ${match.handicap}</div>
                    <div class="odds-grid">
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ah', 'home', ${match.handicapHomeOdds})">
                            <div class="odds-label">主队让球赢</div>
                            <div class="odds-value">${match.handicapHomeOdds}</div>
                        </div>
                        <div style="visibility: hidden;"></div>
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ah', 'away', ${match.handicapAwayOdds})">
                            <div class="odds-label">客队让球赢</div>
                            <div class="odds-value">${match.handicapAwayOdds}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                ${match.totalGoals ? `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #f59e0b; margin-bottom: 8px;">大小球 (OU) ${match.totalGoals}</div>
                    <div class="odds-grid">
                        <div class="odds-item" onclick="selectOdds('${match.id}', 'ou', 'over', ${match.overOdds})">
                            <div class="odds-label">大球</div>
                            <div class="odds-value">${match.overOdds}</div>
                        </div>
                        <div style="visibility: hidden;"></div>
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
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">暂无投注记录</div>';
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

        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-match">${bet.match_id}</div>
                    <div class="bet-details">
                        ${bet.bet_type.toUpperCase()} - ${getBetValueText(bet.bet_value)} | ${bet.points}积分 @ ${bet.odds_at_bet}
                        ${payoutText ? ` | ${payoutText}` : ''}
                    </div>
                </div>
                <div class="bet-result ${resultClass}">${resultText}</div>
            </div>
        `;
    }).join('');
}

function getBetValueText(value) {
    const map = {
        'win': '主胜',
        'draw': '平局',
        'lose': '客胜',
        'home': '主队让球赢',
        'away': '客队让球赢',
        'over': '大球',
        'under': '小球'
    };
    return map[value] || value;
}

async function updateUserInfo() {
    try {
        const response = await apiRequest('/api/user/points');
        if (response.ok) {
            const data = await response.json();
            user.points = data.points;
            localStorage.setItem('user', JSON.stringify(user));
            document.getElementById('pointsBadge').textContent = `积分: ${data.points}`;
        }
    } catch (error) {
        console.error('更新用户信息失败', error);
    }
}

function init() {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
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