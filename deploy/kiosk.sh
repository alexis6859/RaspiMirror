#!/usr/bin/env bash
# Abre o espelho em ecrã inteiro no arranque do Raspberry Pi.
# Raspberry Pi OS (Bookworm, labwc/Wayland): adiciona a ~/.config/labwc/autostart
#   /var/www/html/raspimirror/deploy/kiosk.sh &
# Raspberry Pi OS antigo (X11/LXDE): adiciona a ~/.config/lxsession/LXDE-pi/autostart
#   @/var/www/html/raspimirror/deploy/kiosk.sh

URL="${MIRROR_URL:-http://localhost:3000}"

# espera pelo backend (até 60 s)
for _ in $(seq 1 60); do
    curl -fs "$URL/api/health" >/dev/null && break
    sleep 1
done

# evita o aviso "o Chromium não fechou corretamente"
PREFS="$HOME/.config/chromium/Default/Preferences"
[ -f "$PREFS" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREFS"

# esconde o cursor em X11, se o unclutter existir
command -v unclutter >/dev/null && unclutter -idle 0.5 -root &

BROWSER=$(command -v chromium-browser || command -v chromium)
exec "$BROWSER" \
    --kiosk "$URL" \
    --noerrdialogs --disable-infobars --no-first-run \
    --disable-session-crashed-bubble --disable-features=Translate \
    --check-for-update-interval=31536000 \
    --overscroll-history-navigation=0 \
    --password-store=basic
