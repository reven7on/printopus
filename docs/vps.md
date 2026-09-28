# Эксплуатация Printopus на VPS

VPS содержит общий edge-прокси Caddy и два изолированных Compose-проекта:
`printopus-staging` в `/srv/printopus/staging` и `printopus-production` в
`/srv/printopus/production`. У них разные `.env`, PostgreSQL volumes, uploads,
сессионные секреты и Telegram-боты. База и порт приложения не публикуются
наружу. Caddy — единственный сервис с TCP 80/443 и UDP 443.

Исходный код и Node.js на VPS не нужны: туда копируется только deployment
bundle, а приложение загружается как неизменяемый образ из registry.

## Preflight hoster.by

До заказа подтвердите у поддержки: публичный IPv4; Docker Engine и Compose на
Ubuntu LTS; открытые TCP 80/443 и UDP 443; исходящий HTTPS к Docker Hub и
Telegram; web/VNC-консоль; snapshots; а также расширение vCPU/RAM/NVMe без
переустановки. Стартовая конфигурация — 4 vCPU, 8 GB RAM, 100 GB NVMe. Перед
добавлением CRM замерьте нагрузку; при необходимости увеличьте память до
12–16 GB.

После получения сервера выполните:

```sh
sudo apt update && sudo apt upgrade
sudo apt install -y ca-certificates curl restic ufw unattended-upgrades
# Docker Engine и Compose — из официального Docker-репозитория.
sudo adduser deploy docker
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

В `/etc/ssh/sshd_config.d/printopus.conf` задайте `PasswordAuthentication no`
и `PermitRootLogin no`, затем проверьте вход вторым SSH-сеансом и выполните
`sudo systemctl reload ssh`. Не закрывайте текущий сеанс до проверки ключа.
В `/etc/docker/daemon.json` включите ротацию логов: `json-file`, `max-size`
`10m`, `max-file` `3`; перезапустите Docker в согласованное окно. Никогда не
монтируйте Docker socket в контейнеры. Все `.env` — `chmod 600` и принадлежат
пользователю deploy.

## Каталоги и окружения

```text
/srv/printopus/edge
/srv/printopus/staging
/srv/printopus/production
/srv/printopus/backups
/srv/printopus/restores
```

В каждом каталоге окружения находятся bundle, `.env`, каталог `uploads` и
отдельный `COMPOSE_PROJECT_NAME`. Для staging и production используйте разные
`TELEGRAM_BOT_TOKEN`: у одного Telegram-бота возможен только один webhook.
После успешного healthcheck одноразовый setup-сервис регистрирует защищённый
HTTPS webhook. В production не запускайте polling одновременно с webhook;
повторную регистрацию выполняйте только штатным setup-скриптом bundle.
Постоянный `telegram-worker` доставляет транзакционную очередь уведомлений и
должен работать вместе с приложением. Для группового чата обязательно задайте
`TELEGRAM_MANAGER_USER_IDS`.
Создайте uploads с правами пользователя контейнера, а backup/restore-каталоги
закройте для остальных пользователей.

```sh
sudo install -d -o 1001 -g 1001 -m 0750 /srv/printopus/staging/uploads
sudo install -d -o 1001 -g 1001 -m 0750 /srv/printopus/production/uploads
sudo install -d -o deploy -g deploy -m 0700 /srv/printopus/backups /srv/printopus/restores
```

## Выпуск образов и deployment bundle

Release выполняется на рабочей машине с чистым Git tree, Docker Buildx и npm.
Если локальный Trivy отсутствует, pipeline запускает закреплённый Trivy-контейнер.
Сначала войдите в приватный Docker Hub registry, затем запустите pipeline:

```sh
docker login
DOCKERHUB_NAMESPACE=my-private-namespace npm run release:images -- 0.1.0-rc.1 --push
```

Pipeline выполняет audit, lint, typecheck, тесты, собирает четыре `linux/amd64`
образа, блокирует публикацию существующего immutable-тега, сканирует каждый
образ и сохраняет manifest с digest. В `.release/` также создаётся архив
`printopus-deploy-<version>-<sha>.tar.gz`; только этот архив нужен на VPS.

## Первый деплой

Один и тот же bundle распакуйте в каталоги edge, staging и production. На VPS
выполните `docker login` read-only токеном Docker Hub, создайте общую сеть и
запустите edge:

```sh
docker login
docker network create printopus-edge
cd /srv/printopus/edge
tar -xzf /path/to/printopus-deploy-VERSION-SHA.tar.gz
cp deploy/env/edge.env.example edge.env
chmod 600 edge.env
# Заполните домены и ACME email.
docker compose --env-file edge.env -f deploy/compose.edge.yaml up -d
```

Для staging распакуйте bundle в `/srv/printopus/staging`, создайте `.env` из
шаблона, замените все placeholders и укажите опубликованный immutable tag:

```sh
cd /srv/printopus/staging
tar -xzf /path/to/printopus-deploy-VERSION-SHA.tar.gz
cp deploy/env/staging.env.example .env
chmod 600 .env
# Заполните Docker Hub namespace, tag, пароли и отдельного staging-бота.
./deploy/scripts/deploy.sh
```

Production готовится аналогично из `production.env.example`, но запускается
только после приёмки staging. `deploy.sh` скачивает образы, требует успешный
off-site backup перед повторным деплоем, запускает миграции, ждёт healthcheck,
настраивает webhook и выполняет HTTPS smoke test. При нездоровом приложении он
возвращает предыдущие app и Telegram worker images; миграции БД автоматически
не откатываются.

Ручной rollback приложения и Telegram worker:

```sh
cd /srv/printopus/staging
./deploy/scripts/rollback.sh PREVIOUS_IMMUTABLE_TAG
```

## Backup и off-site storage

Секреты Restic хранятся вне bundle, например `/etc/printopus/restic.env` с
правами `0600`. В файле должны быть `RESTIC_REPOSITORY`,
`RESTIC_PASSWORD_FILE` и, для S3-совместимого хранилища, endpoint/ключи из
документации Restic. Пароль репозитория храните отдельным файлом с правами
`0600`. Поскольку timer запускается от `deploy`, оба файла должны принадлежать
`deploy` и не быть читаемы другими пользователями. Инициализируйте репозиторий
один раз: `restic init`.

```sh
sudo /srv/printopus/production/deploy/scripts/backup.sh /srv/printopus/production/.env
sudo /srv/printopus/staging/deploy/scripts/backup.sh /srv/printopus/staging/.env
```

Скрипт делает custom PostgreSQL dump и архив uploads, создаёт checksum manifest,
затем шифрует и выгружает данные через Restic. Он завершится ошибкой без off-site
настройки — это намеренно, чтобы migration не выполнялась после неполного backup.
Restic применяет retention: 7 daily и 4 weekly snapshots отдельно для каждого
окружения. В bundle есть готовый systemd template; установите его и включите
таймеры для обоих окружений:

```sh
sudo cp /srv/printopus/production/deploy/systemd/printopus-backup@.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now printopus-backup@staging.timer printopus-backup@production.timer
```

Контролируйте код завершения timer и `restic check` не реже раза в месяц.

## Безопасное восстановление

Восстановление запрещено поверх существующего окружения. Целевой проект обязан
начинаться с `printopus-restore-`, его каталог и Docker volume должны быть
новыми, а база не имеет опубликованных портов.

```sh
sudo /srv/printopus/production/deploy/scripts/restore.sh \
  --restic-snapshot latest --target-project printopus-restore-drill-20260925
```

Локальную копию можно передать через `--source /srv/printopus/backups/production/TIMESTAMP`.
Скрипт проверяет manifest и пути в архиве, восстанавливает uploads в
`/srv/printopus/restores/...` и поднимает только временную PostgreSQL. После
проверки удаляйте тест вручную, явно проверив имя проекта и каталога. Проводите
такой drill ежемесячно и фиксируйте дату, snapshot и результат.

## Мониторинг и runbook

Внешний HTTPS-монитор должен проверять `https://beta.printservice.by/api/health`
и production-домен после запуска, с уведомлениями как минимум о недоступности.
Добавьте предупреждения о заполнении диска, неуспешных backup/timer и циклических
рестартах контейнеров. `/api/health` должен вернуть 200 только при доступной БД
и доступном uploads-каталоге.

При инциденте: проверьте DNS/TLS, `docker compose ps`, логи Caddy/app/database,
свободный диск, внешний монитор и последний Restic snapshot. При сбое новой
версии используйте rollback deployment bundle на предыдущий immutable image tag;
БД автоматически не откатывайте. Перед каждой миграцией обязателен успешный
off-site backup.

## Приёмка staging и production

Staging разворачивается исключительно из registry и bundle. До production
проверьте TLS, миграции, uploads, webhook, полный заказ и смену статуса,
переживание перезапуска VPS, rollback image tag и restore drill. Выполните
семидневный внутренний пилот. Production допускается только после отсутствия
critical/high audit findings, подтверждённых контактов и юридических текстов,
проверенного восстановления, изоляции окружений и готовой карты 301-редиректов
старого сайта.
