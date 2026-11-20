# SMZ Access Control

Внутренняя система учёта рабочего времени Suraxanı Maşınqayırma Zavodu. Первый этап: локальный фундамент, база и интерфейс. Это ещё не промышленная эксплуатация.

## Запуск

Нужен Node.js 22 или новее. Команды выполняются в папке проекта:

```bash
npm run dev
```

Приложение открывается только на этом компьютере: [http://127.0.0.1:3000](http://127.0.0.1:3000).

При первом запуске создаётся `.env.local` с секретом сессии и пустая база `data/smz.db`. На экране настройки задаётся учётная запись администратора. Готового пароля нет.

Остановка: `Ctrl+C` в терминале.

## Рабочий компьютер на Windows

Подойдёт 64-битная Windows 10 или Windows 11. На Windows 7 эта версия Node.js не ставится. На самом компьютере с камерой нужны Node.js 22, Git и ffmpeg в `PATH`. Автозапуск и звук динамика на Windows здесь не проверялись.

```bat
git clone https://github.com/sektor404-h9cker/access-control.git
cd access-control
npm install
npm run dev
```

Страница открывается на этом компьютере: `http://127.0.0.1:3000`. Первый запуск создаёт пустую базу и просит завести администратора. Сотрудники, лица и пароли с другого компьютера в Git не входят.

Камера:

```bat
ffmpeg -list_devices true -f dshow -i dummy
copy data\gate-agent.example.json data\gate-agent.json
npm run gate:token
npm run gate:agent
```

В `data\gate-agent.json` поле `device` — имя камеры из списка DirectShow, например `USB2.0 HD UVC WebCam`. Индекс `0` относится к macOS. Автозапуск после входа в Windows, не как служба:

```bat
powershell -ExecutionPolicy Bypass -File scripts\windows\install-gate-task.ps1
```

## Демонстрационные данные

Тестовые записи пишутся только в `data/demo.db` и не попадают в рабочую базу.

```bash
npm run demo:seed
npm run dev:demo
```

Пароль демо-администратора скрипт показывает один раз в терминале.

## Резервная копия

```bash
npm run backup
```

Копия базы и фотографий появляется в `data/backups`. Восстановление пока выполняется вручную: остановить приложение и заменить `data/smz.db` и `data/photos` содержимым копии.

## Проверка

```bash
npm run check
```
