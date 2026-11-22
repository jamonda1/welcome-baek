console.log('[Welcome Baek] Content Script 실행 성공!');

const badge = document.createElement('div');

badge.textContent = 'Welcome Baek 연결 성공';

Object.assign(badge.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    padding: '12px 20px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderRadius: '8px',
    zIndex: '2147483647',
    fontWeight: 'bold',
});

document.body.appendChild(badge);
