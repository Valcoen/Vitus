# Vitus: deploy checklist & phone test

Live since 2026-11-20: migrations 001–007 are applied (006/007 = categories + food database). New migrations go live *together with* their code (each file says so).

All commands run on the VPS as root.

## A. Deploy (≈10 min)

1. **Fresh backup**
   ```bash
   /root/local-files/Vitus-Nutrition/next-app/scripts/backup-db.sh
   ```
2. **Merge to main and push**
   ```bash
   cd /root/local-files/Vitus-Nutrition/next-app && git checkout main && git merge --ff-only feature/kitchen-ready && git push origin main
   ```
3. **Apply migrations 003 (photo storage) and 004 (private households, join function, recipe delete, import timestamps)**
   ```bash
   cd /root/local-files/Vitus-Nutrition/next-app/supabase/migrations && for f in 20261120_003_recipe_images_storage.up.sql 20261120_004_households_join_rpc.up.sql; do docker run --rm --env-file /root/.config/vitus/db.env -v "$PWD":/m:ro postgres:17-alpine sh -c "psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -q -f /m/$f" && echo "$f ok"; done
   ```
   (Or paste both files into the Supabase SQL editor, in this order.)
4. **Deploy the app.** Tests run, the build happens next to the live site, it swaps over, checks health and rolls back by itself if needed:
   ```bash
   /root/local-files/Vitus-Nutrition/next-app/scripts/deploy.sh
   ```
   Your old `~/local-files/Vitus-Nutrition/update-app.sh` now just calls this script.
5. **Check:** open https://vitus.davidshermitage.com and log in.

**Rollback** (if the app works badly but the health check passed):
```bash
cd /root/local-files/Vitus-Nutrition/next-app && mv .next .next-bad && mv .next-prev .next && pm2 restart Vitus-Nutrition
```
Database: every migration has a matching `.down.sql`. Run 004.down **only together with** the old code.

## B. Security follow-ups (5 min, do once all flatmates have an account)

- **Turn off open signup:** Supabase → Authentication → Sign In / Providers → *Allow new users to sign up* → off.
  Today anyone can create an account instantly (auto-confirm is on). Add new flatmates later via Authentication → Users → *Invite user*.
- **Close port 8501.** The old `nutrition-frontend` container (Streamlit, April) is reachable from the internet over plain HTTP. If you no longer need it:
  ```bash
  docker stop nutrition-frontend && docker update --restart=no nutrition-frontend
  ```
  (ufw does not help here: Docker-published ports bypass ufw.)

## C. Backups (2 min)

Nightly at 03:15, kept for 21 days:
```bash
(crontab -l 2>/dev/null; echo '15 3 * * * /root/local-files/Vitus-Nutrition/next-app/scripts/backup-db.sh >> /var/log/vitus-backup.log 2>&1') | crontab -
```
Backups are on the same VPS. For real safety, copy `/root/backups/vitus` to another machine now and then (e.g. `scp` / `rsync` to your laptop).

**Restore test** (into a throwaway container, see the commands in the session notes): the 2026-11-20 backup was restored that way and every row count matched.

## D. Optional: server-side import from an Obsidian folder

Needs the service-role key (Supabase → Project Settings → API → `service_role`). Keep it off the chat and out of git:
```bash
mkdir -p /root/.config/vitus && read -rsp "SERVICE_ROLE_KEY: " K && printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$K" > /root/.config/vitus/service.env && chmod 600 /root/.config/vitus/service.env && echo saved
```
Then a dry run first (writes nothing), and only then `--apply`:
```bash
cd /root/local-files/Vitus-Nutrition/next-app && npm run import:recipes -- /path/to/obsidian/Recipes --as you@example.com
```

---

## Phone test script (≈20 min, before Sunday)

Use your phone on mobile data or Wi-Fi, logged in as the WG planner. Tick each box.

**Login**
- [ ] Log in **with** "Angemeldet bleiben" → reload the page → still logged in.

**Entdecken (Explore)**
- [ ] Menu → *Entdecken*: 9 recipe cards, each with **kcal and protein** (these were missing before) and an orange placeholder instead of a photo.
- [ ] Search "lachs" → 1 card. Tap *High Protein* → only recipes with ≥ 30 g protein. Tap *≤ 30 Min.* → empty list with the "Nichts gefunden" message (old recipes have no times yet). *Filter zurücksetzen*.

**Recipe page**
- [ ] Open "Hähnchen-Brokkoli-Wok": order is image → title → kcal/protein chips → ingredients → steps → (storage, once filled in) → *Nährwertdetails* collapsed at the bottom.
- [ ] Servings + → amounts change (4 → 5 portions: Hähnchenbrust 600 g → 750 g, Olivenöl 40 g → 50 g).
- [ ] Tap two ingredients → crossed out; leave and come back → still ticked; *Häkchen zurücksetzen* clears them.

**Cook mode** (the main test, do it with the phone lying in the kitchen)
- [ ] Tap the big *Kochen starten* button at the bottom → full screen, "Vorbereitung" page with a big checklist.
- [ ] Top right shows *Display an* (yellow). Leave the phone alone for 2+ minutes: **the screen must not turn off.**
- [ ] Swipe left → step 1. Each step shows the matching ingredient amounts as grey chips.
- [ ] On the step with "3 Min." tap **+** once → 4:00 → *Start*. Go to the next step, start its timer too → **two labeled timers** at the bottom.
- [ ] Allow notifications when asked.
- [ ] Switch to another app for 1 minute, then come back → the countdown jumped forward correctly.
- [ ] When a timer ends: **beeping + vibration + red "Fertig!"** (plus a notification if allowed). Tap *Stopp*.
- [ ] Reload the page while a timer is running → reopen *Kochen starten* → the timer is still running with the correct time.
- [ ] Android back button closes cook mode (doesn't leave the recipe).

**Create / edit / photo** (only after migrations 003 + 004)
- [ ] *Entdecken* → *Neu*: title "Test-Bowl", 2 portions, ingredients "200 g Reis" (green "Nährwerte" hint), "2 EL Sojasauce", "Salz und Pfeffer" ("wird als Text übernommen"), a step "10 Min. köcheln", *Foto aufnehmen* with the camera → *Speichern*.
- [ ] The recipe page shows the photo, kcal/protein computed from rice, a 10:00 timer suggestion in cook mode.
- [ ] *Bearbeiten*: move an ingredient with ↑, set kcal to 500 → save → chip shows 500.
- [ ] *Rezept löschen* → confirm → gone from *Entdecken*.

**Import / export** (on your laptop is easier)
- [ ] *Entdecken* → *Export* → zip with 9 `.md` files, each with `status: ready`.
- [ ] *Import*: drop one exported file plus one file with `status: draft` → *Prüfen*: "Unverändert" + "Entwurf – übersprungen". Nothing is written until you press *importieren*.
- [ ] Edit that recipe in the app, re-import the old file → shows **"In der App geändert"** with a checkbox; without ticking it nothing is overwritten.

**Plan & shopping**
- [ ] *Ernährungsplan* → *Wochenplan generieren* asks for confirmation first. (Cancel if you don't want a new plan yet.)
- [ ] *Einkaufsliste* still shows grouped items for the current plan.

**Obsidian import (round 2)**
- [ ] *Import* → *Ordner auswählen* → your Obsidian recipes folder (with the attachments). Preview shows each note as *Neu · als Entwurf* and the image it found (e.g. `image.jpg`).
- [ ] After importing, *Entdecken* → *Entwürfe (n)* chip shows them with a yellow "Entwurf" badge; the normal list doesn't.
- [ ] Open "Ragu Bolognese": photo, ★ 8/10, the intro (Topf / Köchelzeit / Nudeln) in bold, ingredient groups Fleisch / Soffritto / Sauce / Zum Servieren, steps under headings like "Pancetta auslassen (optional)", a "Regeln" card at the bottom.
- [ ] Servings: the note has none, so it says 4 – fix it in *Bearbeiten*, then tap *Fertig (ready)* in the yellow banner → it moves to the normal list.
- [ ] *Kochen starten* → step "1 Std. köcheln" offers a 1:00:00 timer; the step header shows its section name.
- [ ] Export it (.md) → `status: ready`, `rating: 8`, `### Pancetta auslassen (optional)` in the file.

**Gemeinsamer Plan** (menu → *Einstellungen*; there is no "Haushalt" tab anymore)
- [ ] Your plan shows its people with *Entfernen* / *Planer* buttons, an invite link with *Link teilen*.
- [ ] Send the link to a flatmate: they open it, log in (or register, then log in) and land on "Einladung zum gemeinsamen Plan" → *Beitreten*.
- [ ] *Entfernen* removes someone (they can only come back with a link). *Neuen Link erzeugen* makes the old link stop working.

**Kategorien & Lebensmittel (round 3)**
- [ ] *Entdecken*: chips for *Art* (e.g. Hauptgericht, Frühstück), *Gönnen* (Kuchen, Kekse, Desserts), a *Küche* menu, *Vegetarisch* / *Vegan*.
- [ ] *Neu*: set *Art* = „Kuchen & Torten“, *Küche* = „Deutsch“. *Aus Datenbank* → type „mehl“ → pick „Mehl, hell“ → 250 g → *Hinzufügen*. Same with „Ei, ganz, roh“ → 3 Stück, „Butter“ → 125 g, „Zucker, weiß“ → 150 g. The box „Pro Portion“ updates live.
- [ ] Type a line by hand („2 Zwiebeln“): green chip „Zwiebel …“ with kcal. Tap it → choose another food.
- [ ] Save → recipe page shows „Kuchen & Torten · Deutsch“, „Vegetarisch“, and under *Nährwertdetails* also sugar, fibre and salt.
- [ ] *Lebensmittel* (menu): search „paprika“, filter *Käse*; ~1,300 entries.
- [ ] *Ernährungsplan*: open a meal → *Zufällig tauschen* swaps the recipe (meal-prep: all days), *Selbst wählen* opens a searchable list. *Einkaufsliste* follows and is sorted by aisle.

Anything off? Note the step number and what you saw.
