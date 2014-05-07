#!/bin/sh

DEST=~/.local/share/gnome-shell/extensions/keyman@dpoetzsch.github.com

# compile locales
echo "Compiling locales..."
for locpath in locale/*; do
    loc=`basename locpath`
    msgfmt -o $locpath/LC_MESSAGES/keyman.mo $locpath/LC_MESSAGES/keyman.po
done

glib-compile-schemas schemas/

echo "Removing old instance..."
rm -r $DEST
mkdir $DEST

echo "Copying content..."
cp -a extension.js keyman.js clipboard.js keyringDbus.js keyringInterfaces.js \
      utils.js data.js settings.js metadata.json \
      LICENSE README.md schemas/ locale/ keyman.pot stylesheet.css $DEST/
       
echo "Restarting gnome shell..."
gnome-shell --replace &
