# Dylan Dog Tracker

A small personal comic collection tracker. The frontend is plain HTML/CSS/JavaScript; a small PHP JSON API saves data in SQLite, so your collection follows you across browsers and devices.

## Project layout

```text
public/             Browser-accessible files (Nginx web root)
  index.html        Page structure
  style.css         Styles
  app.js            UI and calls to the API
  api.php           JSON API
src/db.php          SQLite connection and database setup
data/               SQLite database is created here (not web-accessible)
deploy/nginx.conf   Example Nginx site config
```

## Run locally

Requirements: PHP 8.1+ with PDO SQLite enabled. On Debian/Ubuntu:

```sh
sudo apt install php-cli php-sqlite3
php -S 127.0.0.1:8000 -t public
```

Open <http://127.0.0.1:8000>. The database is created automatically at `data/dylan.sqlite` on the first API request. Stop the local server with Ctrl+C.

## Deploy on an Ubuntu/Debian VPS

1. Install the small set of packages:

   ```sh
   sudo apt update
   sudo apt install nginx php-fpm php-sqlite3
   ```

2. Copy the project to `/var/www/dd-tracker`, with the same structure. Keep `data/` outside the `public/` directory (it already is).

3. Give the PHP-FPM user write permission to the database directory. On Debian/Ubuntu the user is usually `www-data`:

   ```sh
   sudo chown -R www-data:www-data /var/www/dd-tracker/data
   sudo chmod 750 /var/www/dd-tracker/data
   ```

4. Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/dd-tracker`. Change `tracker.example.com` to your domain and adjust the PHP-FPM socket in `fastcgi_pass` to the installed version. Find the socket with `ls /run/php/`.

5. Enable the site and test the configuration:

   ```sh
   sudo ln -s /etc/nginx/sites-available/dd-tracker /etc/nginx/sites-enabled/dd-tracker
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. Point your domain's DNS A record at the VPS. Once it resolves, enable HTTPS with Certbot:

   ```sh
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d tracker.example.com
   ```

7. For a private personal app, enable the optional Nginx Basic Auth lines in the config and create credentials:

   ```sh
   sudo apt install apache2-utils
   sudo htpasswd -c /etc/nginx/.htpasswd yourname
   ```

   Use HTTPS whenever sending a password over the internet. Basic Auth protects every page and API endpoint without adding login code to this small app.

## Import your existing collection

Open the deployed page and choose **Import**, then select `dylan_dog_backup.json`. The importer accepts the current format (`owned` as a list of comic numbers) and the older `{numero: ...}` object format described in `MODIFICHE.md`. After import, **Export** downloads a JSON backup; keep a copy somewhere other than the VPS.

## Backups

SQLite is a single file. To make a backup while the site is running, use SQLite's backup command (or briefly stop writes):

```sh
sudo -u www-data sqlite3 /var/www/dd-tracker/data/dylan.sqlite \
  ".backup '/var/backups/dylan-tracker.sqlite'"
```

Keep backups off the VPS too. Copying only the `.sqlite` file while it is actively being written can be unsafe when SQLite's WAL mode is in use; the `.backup` command handles that.

## API

The API is intentionally small and has no framework/dependencies:

- `GET /api.php?action=state` — current collection and settings
- `POST /api.php?action=toggle` with `{"num": 42}` — toggle a comic
- `POST /api.php?action=max` with `{"totalComics": 500}` — change the total
- `POST /api.php?action=import` with `{"owned": [1, 2], "totalComics": 500}` — replace collection

Each successful response includes the updated state as JSON. SQLite's unique primary key prevents duplicate comic numbers.

## Cover thumbnails (2025-01-09)

- Added comic cover thumbnails inside each grid card (`div.box`), loaded from `images/products_mapping.json`.
- Thumbnails use `images/` path relative to the page; a `public/images -> ../images` symlink was added so local dev and Nginx deployment both resolve covers correctly.
- Thumbnails are lazy-loaded (`loading="lazy"`), displayed with `height: 45px; object-fit: cover`, and appear only when a mapping exists for that comic number.
