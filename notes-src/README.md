# notes-src

Sources MkDocs Material du site **kirizukon.xyz/notes/**.

## Structure

```
notes-src/
├── mkdocs.yml          # config MkDocs (thème, nav, extensions)
├── build.sh            # mkdocs build + djlint reformat
└── docs/               # contenu markdown
    ├── index.md
    └── projets/
```

Le site buildé est généré dans `../notes/` (servi par GitHub Pages à `kirizukon.xyz/notes/`).

## Workflow

### Prérequis (une seule fois)

```bash
pipx install mkdocs
pipx inject mkdocs mkdocs-material pymdown-extensions
pipx install djlint
```

### Aperçu local

```bash
cd notes-src
mkdocs serve          # http://127.0.0.1:8000/notes/
```

### Build pour publication

```bash
cd notes-src
./build.sh            # mkdocs build + format HTML (djlint)
```

### Publier

```bash
git add notes-src notes
git commit -m "notes: <résumé>"
git push
```

GitHub Pages servira la nouvelle version en ~1 minute.

## Ajouter une nouvelle page

1. Créer `docs/<section>/<slug>.md`
2. L'ajouter dans `mkdocs.yml` sous `nav:`
3. `./build.sh` + commit

## Conventions

- **Frontmatter** sur chaque page : `title`, `description`.
- **Admonitions** Material (`!!! note`, `!!! warning`, `!!! danger`, `!!! tip`, `!!! bug`) pour mettre en avant.
- **MITRE ATT&CK** : citer les techniques (`T1110`, `T1190`…) dans les tableaux de règles de détection.
