# Boîtes Zapmail — campagne EP (apporteurs)

Importées depuis les exports Downloads `mailboxes-*.xlsx` + fiche Daniel.

## Emplacements

| Fichier | Rôle |
|---------|------|
| [fiche-configuration-denshees-aronne.html](./fiche-configuration-denshees-aronne.html) | Réglages cadence / fenêtres / garde-fous |
| `scripts/import-zapmail-mailboxes.mjs` | Ré-import depuis Downloads |
| `scripts/.mailboxes.local.json` | Secrets locaux (**gitignored**) |

Aussi copié dans : `livrables-semaine1/4-setup-denshees/fiche-configuration-denshees-aronne.html`

## Domaines (cold, jamais epdigital.fr principal)

- `agence-epdigital.com` — daniel@, geraldine@, robin@
- `epdigital-agence.com` — daniel@, geraldine@, robin@

SMTP/IMAP Google : `smtp.gmail.com:465` / `imap.gmail.com:993`

## Réglages appliqués sur campagne EP

- **6 boîtes** liées à la campagne
- **dailyLimit** initial : **5**/jour/boîte (montée progressive fiche §02)
- **Tracking** : OFF
- **Fenêtre** : MORNING (alignée pic B2B ; après-midi = évolution future)
- **Jours** : lundi → vendredi
- **Statut** : PAUSED (à passer RUNNING seulement après tests SMTP + mail-tester)

## Ré-import

```bash
node denshees/scripts/import-zapmail-mailboxes.mjs
```

Les xlsx doivent être dans `%USERPROFILE%\Downloads`.
