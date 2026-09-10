#!/bin/bash
# À exécuter DEPUIS le dossier qui contient les fichiers à plat
# (ex: ~/Téléchargements/files), avec : bash reorganize.sh
set -e

mkdir -p config nepting services controllers routes

mv -v nepting.config.js config/
mv -v tlv.builder.js nepting/
mv -v tlv.parser.js nepting/
mv -v nepting.client.js nepting/
mv -v payment.service.js services/
mv -v payment.controller.js controllers/
mv -v payment.routes.js routes/

echo ""
echo "Réorganisation terminée. Nouvelle structure :"
find . -maxdepth 2 -type f -name "*.js" | sort
