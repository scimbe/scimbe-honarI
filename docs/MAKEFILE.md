# Makefile Dokumentation - Enhanced Temporal Workflow Platform

## Übersicht

Das Makefile bietet eine professionelle und benutzerfreundliche Schnittstelle zur Verwaltung der gesamten Docker-basierten Temporal Workflow Platform. Es unterstützt alle notwendigen Operationen von der Initialisierung bis zum vollständigen System-Reset.

## Installation

Das Makefile ist bereits im Hauptverzeichnis des Projekts vorhanden. Keine zusätzliche Installation erforderlich.

## Grundlegende Befehle

### System-Management

```bash
# Hilfe anzeigen
make help

# System erstmalig initialisieren (build + start)
make init

# Alle Services starten
make start

# Alle Services stoppen
make stop

# Alle Services neustarten
make restart

# System komplett zurücksetzen (ACHTUNG: Datenverlust!)
make reset
```

### Service-Status

```bash
# Status aller Services anzeigen
make status

# Gesundheitsprüfung aller Services
make health

# Port-Übersicht anzeigen
make ports

# System-Informationen anzeigen
make info
```

### Rebuild-Operationen

```bash
# Einzelnen Service mit --no-cache neu bauen
make rebuild SERVICE=enhanced-workflow-editor

# ALLE Services mit --no-cache neu bauen
make rebuild-all

# Alle API Services neu bauen
make rebuild-api
```

### Service-spezifische Operationen

```bash
# Einzelnen Service stoppen
make stop-service SERVICE=temporal-worker

# Einzelnen Service neustarten
make restart-service SERVICE=temporal-worker

# Shell in Service öffnen
make shell SERVICE=postgres

# Befehl in Service ausführen
make exec SERVICE=postgres CMD='psql -U temporal'
```

### Logs

```bash
# Logs anzeigen (alle Services oder spezifisch)
make logs                            # Alle Services
make logs SERVICE=temporal-worker   # Spezifischer Service

# Logs kontinuierlich verfolgen
make logs-follow
make logs-follow SERVICE=enhanced-workflow-editor
```

### Tests

```bash
# Alle Systemtests durchführen
make test

# API Endpoints testen
make test-api

# Workflow-Ausführung testen
make test-workflow
```

### Aufräumen

```bash
# Gestoppte Container und ungenutzte Images entfernen
make clean

# ACHTUNG: Alle Volumes löschen (Datenverlust!)
make clean-volumes
```

## Service-Gruppen

Das Makefile organisiert Services in logische Gruppen:

- **infrastructure**: postgres, redis, temporal-server, temporal-web
- **core**: workflow-automation, temporal-worker
- **api**: enhanced-workflow-editor, mlops-service, mock-execution-service

## Ports

| Service | Port | Beschreibung |
|---------|------|--------------|
| PostgreSQL | 5432 | Datenbank |
| Redis | 6379 | Cache |
| Temporal Server | 7233 | gRPC API |
| Temporal Web UI | 8233 | Web Interface |
| Workflow Automation | 8092 | API Service |
| Temporal Worker | 8081 | Worker Service |
| Enhanced Editor API | 3001 | Workflow Editor |
| MLOps Service | 3002 | MLOps Pipeline |
| Mock Service | 3005 | Test Service |
| Frontend | 3000 | Web Application |

## Beispiel-Workflows

### Erstmalige Einrichtung

```bash
# System komplett neu aufsetzen
make init
make test
```

### Entwicklung

```bash
# Service nach Änderungen neu bauen
make rebuild SERVICE=enhanced-workflow-editor

# Logs überprüfen
make logs SERVICE=enhanced-workflow-editor

# Health-Check durchführen
make health
```

### Fehlerbehebung

```bash
# Status prüfen
make status

# Logs untersuchen
make logs-follow SERVICE=temporal-worker

# Service neustarten
make restart-service SERVICE=temporal-worker

# System-Reset bei Problemen
make reset
make init
```

### Wartung

```bash
# System aufräumen
make clean

# Alle Services updaten
make rebuild-all
make restart
```

## Umgebungsvariablen

Das Makefile nutzt folgende Konfiguration:

- `COMPOSE_FILE`: docker-compose.yml
- `REBUILD_FLAGS`: --no-cache
- `HEALTH_CHECK_RETRIES`: 30
- `HEALTH_CHECK_DELAY`: 2 Sekunden

## Sicherheitshinweise

⚠️ **ACHTUNG bei folgenden Befehlen:**

- `make reset`: Löscht ALLE Daten und setzt das System zurück
- `make clean-volumes`: Löscht alle Docker Volumes (Datenverlust!)

Beide Befehle fragen zur Sicherheit nach Bestätigung.

## Fehlerbehandlung

Das Makefile enthält umfangreiche Fehlerprüfungen:

- Prüfung auf fehlende Parameter (z.B. SERVICE=)
- Health-Checks mit Timeout-Handling
- Farbcodierte Ausgaben für bessere Lesbarkeit
- Bestätigungsabfragen bei kritischen Operationen

## Aliase

Für häufig genutzte Befehle existieren Kurzformen:

- `make up` → `make start`
- `make down` → `make stop`
- `make ps` → `make status`

## Tipps

1. **Schnellstart**: `make init` für komplette Ersteinrichtung
2. **Tägliche Arbeit**: `make status` und `make health` zur Überwachung
3. **Bei Problemen**: `make logs SERVICE=<name>` zur Fehlersuche
4. **Updates**: `make rebuild SERVICE=<name>` für einzelne Services
5. **Kompletter Neustart**: `make reset && make init` bei schweren Problemen

## Support

Bei Problemen:

1. `make health` ausführen
2. `make logs` prüfen
3. `make test` für Systemtests
4. Bei Bedarf `make reset && make init` für Neustart

## Versionierung

Makefile Version: 1.0.0
Kompatibel mit: Enhanced Temporal Workflow Platform v2.0.0