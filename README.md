# Oukilé API

## Naissance du projet
Ce projet est né de la volonté de créer une API moderne pour le service de transport en commun d'AggloBus, qui dessert l'agglomération de Bourges.
L'objectif principal est de fournir une interface RESTful pour accéder aux données des arrêts de bus, des lignes et des horaires.

En 2024 Agglobus à sorti une nouvelle application mobile pour les usagers de son réseau de transport.
Cependant, cette application ne permet pas d'avoir le suivi des bus en temps réél contrairement à son ancètre [BusInfo](https://play.google.com/store/apps/details?id=fr.businfo.businfobourges&hl=fr&pli=1), qui n'est plus maintenue.

Cette API servira de backend moderne pour une application mobile ou un site web alternatif, permettant aux voyageurs de consulter les horaires de bus, les arrêts et les lignes disponibles.

Ce projet est un projet personnel et n'est pas affilié à Agglobus ou à la RATP.

## Fonctionnalités
- Localisation en temps réél des bus
- Caching des données pour améliorer les performances et limiter les requêtes sur l'infrastructure d'Agglobus.

## AVERTISSEMENT
Pour des raisons de sécurité les endpoints utilisés pour le dévloppement de l'API ne sont pas accessibles au public.

Ils sont accessible par un travail de reverse engineering.

## Stack technique
- **Docker**
- **Node.js**
- **TypeScript**
- **Express**
- **Socket.io**
- **Redis**
- **xml2js**
- **Caddy**

## Installation
1. Clonez le dépôt :
   ```bash
   git clone https://github.com/OukileDev/locator
    cd locator
    ```
2. Installez les dépendances :
    ```bash
   npm install
   ```
3. Configurez les variables d'environnement :
    ```bash
   cp .env.example .env
   vim .env
   ```
4. Lancez le projet :
    ```bash
    docker compose up -d
    ```
   
## Contribution
Si vous souhaitez contribuer à ce projet, n'hésitez pas à ouvrir une issue ou une pull request.
Toute contribution est la bienvenue !

# Message pour Agglobus, RATPDev ou société associée
Je ne suis pas un hacker, je suis une développeuse passionnée et usagère d'Agglobus.

Ce projet est né d'une frustration personnelle face à l'absence de suivi en temps réel des bus dans la nouvelle application mobile d'Agglobus. J'ai donc décidé de créer un outil moderne pour combler cette lacune et offrir une meilleure expérience utilisateur.

Je tiens à préciser que ce projet est non commercial. Mon objectif est uniquement d'améliorer le service rendu aux usagers d'Agglobus.

Je serais ravie de collaborer avec vous pour intégrer ces fonctionnalités dans l'application officielle.

Si vous souhaitez me contacter pour tout motif lié à ce projet, n'hésitez pas à m'écrire à l'adresse suivante :
[oukile-dev@lucie.re](mailto:oukile-dev@lucie.re)
