# Contribuir a HellDots

## Convención de commits

Este repo sigue [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<alcance opcional>): <descripción corta>

<cuerpo opcional>
```

Tipos usados en este proyecto: `feat`, `fix`, `test`, `chore`, `docs`,
`refactor`. El alcance suele ser el área tocada (`shadow-dom`, `build`,
`ci`, etc.), en línea con el historial de commits existente.

## Versionado y changelog (changesets)

El versionado semántico y `CHANGELOG.md` para el **paquete publicado en
npm** se automatizan con [changesets](https://github.com/changesets/changesets).
`CHANGELOG.md` en la raíz (mantenido a mano durante el desarrollo del plan
técnico) y el que genera changesets sirven propósitos distintos: el de la
raíz documenta decisiones de arquitectura mientras se construye la
librería; el generado por changesets documenta releases reales de npm
versión por versión.

Flujo:

1. Al hacer un cambio que deba reflejarse en una versión publicada, correr:

   ```bash
   npm run changeset
   ```

   Esto pregunta el tipo de bump (`patch`/`minor`/`major`) y el resumen del
   cambio, y crea un archivo en `.changeset/`.

2. Commitear ese archivo junto con el cambio de código.

3. Cuando toca cortar una release, correr:

   ```bash
   npm run release   # changeset version
   ```

   Esto consume todos los changesets pendientes, actualiza `version` en
   `package.json` y agrega la entrada correspondiente a `CHANGELOG.md`.

4. Commitear el bump de versión, taggear (`git tag vX.Y.Z`) y pushear el
   tag — `.github/workflows/release.yml` se dispara con tags `v*` (ver
   `DECISIONS.md` sobre el estado de ese workflow).

## Antes de abrir un PR

```bash
npm run lint && npm run typecheck && npm test && npm run test:coverage && npm run build && npm run size
```
