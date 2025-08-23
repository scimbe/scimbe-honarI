# Enhanced Temporal Workflow Platform - Makefile
# Professional Docker orchestration with health checks and management commands

.PHONY: help start stop restart rebuild reset status logs test clean init health all

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
PURPLE := \033[0;35m
CYAN := \033[0;36m
WHITE := \033[1;37m
NC := \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

# Configuration
COMPOSE_FILE := docker-compose.yml
COMPOSE_CMD := docker-compose -f $(COMPOSE_FILE)
REBUILD_FLAGS := --no-cache
HEALTH_CHECK_RETRIES := 30
HEALTH_CHECK_DELAY := 2

# Service groups
INFRASTRUCTURE_SERVICES := postgres redis temporal-server temporal-web
CORE_SERVICES := workflow-automation temporal-worker
API_SERVICES := enhanced-workflow-editor mlops-service mock-execution-service
FRONTEND_SERVICES := frontend
ALL_SERVICES := $(INFRASTRUCTURE_SERVICES) $(CORE_SERVICES) $(API_SERVICES)

# Help command
help: ## Zeigt diese Hilfe an
	@echo ""
	@echo "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
	@echo "${CYAN}║   Enhanced Temporal Workflow Platform - Management System        ║${NC}"
	@echo "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
	@echo ""
	@echo "${YELLOW}Verfügbare Befehle:${NC}"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "${GREEN}  %-20s${NC} %s\n", $$1, $$2}'
	@echo ""
	@echo "${YELLOW}Service Gruppen:${NC}"
	@echo "  ${BLUE}infrastructure${NC}  - postgres, redis, temporal-server, temporal-web"
	@echo "  ${BLUE}core${NC}           - workflow-automation, temporal-worker"
	@echo "  ${BLUE}api${NC}            - enhanced-workflow-editor, mlops-service, mock-execution-service"
	@echo "  ${BLUE}all${NC}            - Alle Services"
	@echo ""
	@echo "${YELLOW}Beispiele:${NC}"
	@echo "  ${GREEN}make start${NC}              # Startet alle Services"
	@echo "  ${GREEN}make rebuild SERVICE=enhanced-workflow-editor${NC}"
	@echo "  ${GREEN}make logs SERVICE=temporal-worker${NC}"
	@echo "  ${GREEN}make reset${NC}              # System komplett zurücksetzen"
	@echo ""

# Initialisierung
init: ## Initialisiert das System erstmalig
	@echo "${CYAN}🚀 Initialisiere Enhanced Temporal Workflow Platform...${NC}"
	@$(MAKE) rebuild-all
	@$(MAKE) start
	@echo "${GREEN}✅ System erfolgreich initialisiert!${NC}"

# Start commands
start: ## Startet alle Services
	@echo "${CYAN}🚀 Starte alle Services...${NC}"
	@$(COMPOSE_CMD) up -d
	@$(MAKE) health-wait
	@echo "${GREEN}✅ Alle Services gestartet!${NC}"
	@$(MAKE) status

start-infrastructure: ## Startet nur Infrastructure Services
	@echo "${CYAN}🔧 Starte Infrastructure Services...${NC}"
	@$(COMPOSE_CMD) up -d $(INFRASTRUCTURE_SERVICES)
	@sleep 5
	@echo "${GREEN}✅ Infrastructure Services gestartet!${NC}"

start-core: start-infrastructure ## Startet Core Services (mit Infrastructure)
	@echo "${CYAN}⚙️ Starte Core Services...${NC}"
	@$(COMPOSE_CMD) up -d $(CORE_SERVICES)
	@sleep 3
	@echo "${GREEN}✅ Core Services gestartet!${NC}"

start-api: start-core ## Startet API Services (mit Core und Infrastructure)
	@echo "${CYAN}🔌 Starte API Services...${NC}"
	@$(COMPOSE_CMD) up -d $(API_SERVICES)
	@sleep 3
	@echo "${GREEN}✅ API Services gestartet!${NC}"

# Stop commands
stop: ## Stoppt alle Services
	@echo "${YELLOW}⏹️  Stoppe alle Services...${NC}"
	@$(COMPOSE_CMD) down
	@echo "${GREEN}✅ Alle Services gestoppt!${NC}"

stop-service: ## Stoppt einen spezifischen Service (SERVICE=name)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${RED}❌ Fehler: SERVICE Parameter fehlt${NC}"; \
		echo "${YELLOW}   Beispiel: make stop-service SERVICE=temporal-worker${NC}"; \
		exit 1; \
	fi
	@echo "${YELLOW}⏹️  Stoppe Service: $(SERVICE)...${NC}"
	@$(COMPOSE_CMD) stop $(SERVICE)
	@echo "${GREEN}✅ Service $(SERVICE) gestoppt!${NC}"

# Restart commands
restart: ## Startet alle Services neu
	@echo "${CYAN}🔄 Starte alle Services neu...${NC}"
	@$(MAKE) stop
	@$(MAKE) start

restart-service: ## Startet einen Service neu (SERVICE=name)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${RED}❌ Fehler: SERVICE Parameter fehlt${NC}"; \
		echo "${YELLOW}   Beispiel: make restart-service SERVICE=temporal-worker${NC}"; \
		exit 1; \
	fi
	@echo "${CYAN}🔄 Starte Service $(SERVICE) neu...${NC}"
	@$(COMPOSE_CMD) restart $(SERVICE)
	@echo "${GREEN}✅ Service $(SERVICE) neugestartet!${NC}"

# Rebuild commands
rebuild: ## Rebuilt einen Service mit --no-cache (SERVICE=name)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${RED}❌ Fehler: SERVICE Parameter fehlt${NC}"; \
		echo "${YELLOW}   Beispiel: make rebuild SERVICE=enhanced-workflow-editor${NC}"; \
		exit 1; \
	fi
	@echo "${PURPLE}🔨 Rebuilde Service: $(SERVICE) mit --no-cache...${NC}"
	@$(COMPOSE_CMD) build $(REBUILD_FLAGS) $(SERVICE)
	@echo "${GREEN}✅ Service $(SERVICE) rebuilt!${NC}"
	@echo "${CYAN}🔄 Starte Service $(SERVICE) neu...${NC}"
	@$(COMPOSE_CMD) up -d $(SERVICE)
	@echo "${GREEN}✅ Service $(SERVICE) neugestartet!${NC}"

rebuild-all: ## Rebuilt ALLE Services mit --no-cache
	@echo "${PURPLE}🔨 Rebuilde ALLE Services mit --no-cache...${NC}"
	@echo "${YELLOW}⚠️  Dies kann einige Minuten dauern...${NC}"
	@$(COMPOSE_CMD) build $(REBUILD_FLAGS)
	@echo "${GREEN}✅ Alle Services rebuilt!${NC}"

rebuild-api: ## Rebuilt alle API Services
	@echo "${PURPLE}🔨 Rebuilde API Services...${NC}"
	@for service in $(API_SERVICES); do \
		echo "${CYAN}  Building $$service...${NC}"; \
		$(COMPOSE_CMD) build $(REBUILD_FLAGS) $$service; \
	done
	@echo "${GREEN}✅ API Services rebuilt!${NC}"

# Reset command
reset: ## ACHTUNG: Setzt das komplette System zurück!
	@echo "${RED}⚠️  WARNUNG: Dies wird das komplette System zurücksetzen!${NC}"
	@echo "${YELLOW}   - Alle Container werden gestoppt und gelöscht${NC}"
	@echo "${YELLOW}   - Alle Volumes werden gelöscht${NC}"
	@echo "${YELLOW}   - Alle Netzwerke werden gelöscht${NC}"
	@echo "${YELLOW}   - Die Datenbank wird gelöscht${NC}"
	@echo ""
	@read -p "Wirklich fortfahren? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		echo "${RED}🗑️  Setze System zurück...${NC}"; \
		$(COMPOSE_CMD) down -v --remove-orphans; \
		docker system prune -f; \
		echo "${GREEN}✅ System zurückgesetzt!${NC}"; \
		echo "${CYAN}   Führe 'make init' aus, um das System neu zu initialisieren${NC}"; \
	else \
		echo "${BLUE}↩️  Abgebrochen${NC}"; \
	fi

# Status and health commands
status: ## Zeigt den Status aller Services
	@echo "${CYAN}📊 Service Status:${NC}"
	@echo "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
	@$(COMPOSE_CMD) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

health: ## Prüft die Gesundheit aller Services
	@echo "${CYAN}🏥 Health Check für alle Services...${NC}"
	@echo ""
	@$(MAKE) health-postgres
	@$(MAKE) health-redis
	@$(MAKE) health-temporal
	@$(MAKE) health-api
	@echo ""
	@echo "${GREEN}✅ Health Check abgeschlossen!${NC}"

health-postgres: ## Prüft PostgreSQL
	@echo -n "  PostgreSQL (5432):        "
	@if $(COMPOSE_CMD) exec -T postgres pg_isready -U temporal >/dev/null 2>&1; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi

health-redis: ## Prüft Redis
	@echo -n "  Redis (6379):            "
	@if $(COMPOSE_CMD) exec -T redis redis-cli ping >/dev/null 2>&1; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi

health-temporal: ## Prüft Temporal Server
	@echo -n "  Temporal Server (7233):  "
	@if curl -f http://localhost:8233 >/dev/null 2>&1; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi

health-api: ## Prüft API Services
	@echo -n "  Enhanced Editor (3001):  "
	@if curl -f http://localhost:3001/health 2>/dev/null | jq -r '.status' | grep -q healthy; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi
	@echo -n "  MLOps Service (3002):    "
	@if curl -f http://localhost:3002/health 2>/dev/null | jq -r '.status' | grep -q healthy; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi
	@echo -n "  Mock Service (3005):     "
	@if curl -f http://localhost:3005/health 2>/dev/null | jq -r '.status' | grep -q healthy; then \
		echo "${GREEN}✅ Healthy${NC}"; \
	else \
		echo "${RED}❌ Unhealthy${NC}"; \
	fi

health-wait: ## Wartet bis alle Services gesund sind
	@echo "${CYAN}⏳ Warte auf Service-Bereitschaft...${NC}"
	@for i in $$(seq 1 $(HEALTH_CHECK_RETRIES)); do \
		all_healthy=true; \
		if ! $(COMPOSE_CMD) exec -T postgres pg_isready -U temporal >/dev/null 2>&1; then \
			all_healthy=false; \
		fi; \
		if ! curl -f http://localhost:8233 >/dev/null 2>&1; then \
			all_healthy=false; \
		fi; \
		if $$all_healthy; then \
			echo "${GREEN}✅ Alle Services bereit!${NC}"; \
			break; \
		fi; \
		if [ $$i -eq $(HEALTH_CHECK_RETRIES) ]; then \
			echo "${RED}❌ Timeout: Services nicht bereit nach $$(($(HEALTH_CHECK_RETRIES) * $(HEALTH_CHECK_DELAY))) Sekunden${NC}"; \
			exit 1; \
		fi; \
		echo "  Warte... ($$i/$(HEALTH_CHECK_RETRIES))"; \
		sleep $(HEALTH_CHECK_DELAY); \
	done

# Test commands
test: ## Führt Systemtests durch
	@echo "${CYAN}🧪 Führe Systemtests durch...${NC}"
	@echo ""
	@$(MAKE) test-api
	@$(MAKE) test-workflow
	@echo ""
	@echo "${GREEN}✅ Alle Tests erfolgreich!${NC}"

test-api: ## Testet API Endpoints
	@echo "${CYAN}📡 Teste API Endpoints...${NC}"
	@echo -n "  GET  /api/workflows:     "
	@if curl -f http://localhost:3001/api/workflows 2>/dev/null | jq -r '.workflows' >/dev/null; then \
		echo "${GREEN}✅ OK${NC}"; \
	else \
		echo "${RED}❌ Failed${NC}"; \
	fi

test-workflow: ## Testet Workflow-Ausführung
	@echo "${CYAN}⚙️  Teste Workflow-Ausführung...${NC}"
	@echo -n "  Circle Area Workflow:    "
	@if curl -X POST http://localhost:3001/api/execute/circle-area-calculation \
		-H "Content-Type: application/json" \
		-d '{"input":{"radius":5}}' 2>/dev/null | jq -r '.success' | grep -q true; then \
		echo "${GREEN}✅ OK${NC}"; \
	else \
		echo "${RED}❌ Failed${NC}"; \
	fi

# Logs commands
logs: ## Zeigt Logs (SERVICE=name oder alle)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${CYAN}📜 Zeige Logs aller Services (letzte 50 Zeilen)...${NC}"; \
		$(COMPOSE_CMD) logs --tail=50; \
	else \
		echo "${CYAN}📜 Zeige Logs von $(SERVICE)...${NC}"; \
		$(COMPOSE_CMD) logs --tail=100 $(SERVICE); \
	fi

logs-follow: ## Folgt den Logs (SERVICE=name oder alle)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${CYAN}📜 Folge Logs aller Services...${NC}"; \
		$(COMPOSE_CMD) logs -f; \
	else \
		echo "${CYAN}📜 Folge Logs von $(SERVICE)...${NC}"; \
		$(COMPOSE_CMD) logs -f $(SERVICE); \
	fi

# Cleanup commands
clean: ## Entfernt gestoppte Container und ungenutzte Images
	@echo "${YELLOW}🧹 Räume auf...${NC}"
	@docker system prune -f
	@echo "${GREEN}✅ Aufgeräumt!${NC}"

clean-volumes: ## ACHTUNG: Löscht alle Volumes (Datenverlust!)
	@echo "${RED}⚠️  WARNUNG: Dies löscht alle Docker Volumes!${NC}"
	@read -p "Wirklich fortfahren? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker volume prune -f; \
		echo "${GREEN}✅ Volumes gelöscht!${NC}"; \
	else \
		echo "${BLUE}↩️  Abgebrochen${NC}"; \
	fi

# Quick access commands
up: start ## Alias für 'start'
down: stop ## Alias für 'stop'
ps: status ## Alias für 'status'

# Development helpers
shell: ## Öffnet eine Shell in einem Service (SERVICE=name)
	@if [ -z "$(SERVICE)" ]; then \
		echo "${RED}❌ Fehler: SERVICE Parameter fehlt${NC}"; \
		echo "${YELLOW}   Beispiel: make shell SERVICE=postgres${NC}"; \
		exit 1; \
	fi
	@echo "${CYAN}🔍 Öffne Shell in $(SERVICE)...${NC}"
	@$(COMPOSE_CMD) exec $(SERVICE) /bin/sh

exec: ## Führt einen Befehl in einem Service aus (SERVICE=name CMD=command)
	@if [ -z "$(SERVICE)" ] || [ -z "$(CMD)" ]; then \
		echo "${RED}❌ Fehler: SERVICE und CMD Parameter benötigt${NC}"; \
		echo "${YELLOW}   Beispiel: make exec SERVICE=postgres CMD='psql -U temporal'${NC}"; \
		exit 1; \
	fi
	@echo "${CYAN}▶️  Führe aus in $(SERVICE): $(CMD)${NC}"
	@$(COMPOSE_CMD) exec $(SERVICE) $(CMD)

# Port information
ports: ## Zeigt alle Service-Ports
	@echo "${CYAN}🔌 Service Ports:${NC}"
	@echo "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
	@echo "  ${BLUE}PostgreSQL:${NC}              5432"
	@echo "  ${BLUE}Redis:${NC}                   6379"
	@echo "  ${BLUE}Temporal Server:${NC}         7233"
	@echo "  ${BLUE}Temporal Web UI:${NC}         8233 (http://localhost:8233)"
	@echo "  ${BLUE}Workflow Automation:${NC}     8092"
	@echo "  ${BLUE}Temporal Worker:${NC}         8081"
	@echo "  ${BLUE}Enhanced Editor API:${NC}     3001"
	@echo "  ${BLUE}MLOps Service:${NC}           3002"
	@echo "  ${BLUE}Mock Service:${NC}            3005"
	@echo "  ${BLUE}Frontend:${NC}                3000"

# Info command
info: ## Zeigt System-Informationen
	@echo "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
	@echo "${CYAN}║   Enhanced Temporal Workflow Platform - System Information       ║${NC}"
	@echo "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
	@echo ""
	@$(MAKE) ports
	@echo ""
	@$(MAKE) status
	@echo ""
	@$(MAKE) health