# Guide client - installation TPE (THE BARBER)

`Guide-installation-TPE-THE-BARBER.pdf` : guide pas à pas à envoyer au salon,
avec `TPE-Bridge-Installeur.bat` (généré par `../standalone/build.sh`).

Pour le régénérer après modification :

```bash
pip install reportlab
python3 generer_guide.py
```

Les valeurs du salon (IP, port, numéro de caisse, adresse de l'app) sont en
tête de `generer_guide.py`.
