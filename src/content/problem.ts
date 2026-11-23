
const main = document.querySelector<HTMLElement>(
  '.container.content'
);

if (main && !document.querySelector('#welcome-baek-layout')) {
  // 전체 분할 레이아웃
  const layout = document.createElement('div');
  layout.id = 'welcome-baek-layout';

  // 기존 백준 영역
  main.classList.add('welcome-baek-problem');

  // Welcome Baek 영역
  const panel = document.createElement('aside');
  panel.id = 'welcome-baek-panel';

  const title = document.createElement('h2');
  title.textContent = 'Welcome Baek';

  const description = document.createElement('p');
  description.textContent = '코드 에디터 영역';

  panel.append(title, description);

  // 기존 위치에 분할 레이아웃 삽입
  main.before(layout);
  layout.append(main, panel);
}
