# Intégration GoodWe

Suivez votre installation solaire GoodWe dans Gladys : production solaire,
consommation de la maison, soutirage/injection réseau et batterie, en direct,
avec scènes et widgets de tableau de bord.

## Onduleurs pris en charge

| Famille                | Modèles                                    | Local (réseau) | Cloud SEMS |
| ---------------------- | ------------------------------------------ | -------------- | ---------- |
| ET (hybride, batterie) | ET, EH, BT, BH, ET Plus, EHA/ESA G20, GEH… | ✅ + réglages  | ✅         |
| ES (hybride, batterie) | ES, EM, BP, SBP                            | ✅ + réglages  | ✅         |
| DT (réseau)            | DT, SDT, MT, MS, D-NS, XS, GEP…            | ✅             | ✅         |

L'onduleur doit avoir son module WiFi ou LAN GoodWe (Wi-Fi Kit, WiFi/LAN Kit,
Ezlink…) connecté à votre réseau.

## Deux façons de joindre l'onduleur

**Local (recommandé).** Gladys parle directement à l'onduleur sur votre réseau
(port UDP 8899) : valeurs chaque minute, énergie du jour, index des compteurs,
température, et réglages disponibles dans les scènes. Pas de compte, pas besoin
d'Internet.

**Cloud SEMS (facultatif).** Le compte du portail SEMS / de l'application
SEMS+. Fonctionne quand Gladys n'est pas sur le même réseau que l'onduleur, et
sert de secours quand la connexion locale échoue. Lecture seule, actualisé
toutes les 5 minutes (le portail limite les requêtes plus fréquentes).

Avec les deux, chaque onduleur est **un seul** appareil : lu en local, il
bascule sur le cloud si la connexion locale est perdue (un point orange sur le
badge « cloud » le signale), puis revient. L'option standard **Préférer la
connexion locale** choisit le canal essayé en premier.

## Configuration

1. Installez l'intégration depuis **Intégrations → GoodWe**.
2. Connexion locale :
   - laissez **Rechercher les onduleurs GoodWe sur le réseau** activé : Gladys
     diffuse la requête de découverte GoodWe sur votre réseau ;
   - si l'onduleur n'est pas trouvé (autre sous-réseau, VLAN, box qui bloque
     la diffusion), saisissez son **adresse IP**. Fixez-la dans votre box
     (réservation DHCP) pour qu'elle ne change pas.
3. Cloud (facultatif) : saisissez l'**adresse e-mail** et le **mot de passe**
   de votre compte SEMS. Astuce : créez un compte _visiteur_ dédié dans
   l'application SEMS (Centrale → Visiteurs) plutôt que de confier le compte
   propriétaire.
4. Cliquez sur **Tester la connexion** : chaque onduleur trouvé est listé avec
   son modèle et son numéro de série.
5. Ouvrez l'onglet **Découverte** et ajoutez votre ou vos onduleurs.

## Fonctionnalités de l'appareil

Selon le modèle et la connexion, chaque onduleur publie :

| Fonctionnalité              | Unité | Remarques                                      |
| --------------------------- | ----- | ---------------------------------------------- |
| Production solaire          | W     | toutes                                         |
| Production du jour / totale | kWh   | local                                          |
| Puissance réseau            | W     | soutirage > 0, injection < 0 (compteur requis) |
| Index soutirage / injection | kWh   | ET, DT avec compteur                           |
| Consommation de la maison   | W     | compteur requis                                |
| Niveau de batterie          | %     | hybrides avec batterie                         |
| Charge / décharge batterie  | W     | hybrides avec batterie                         |
| Énergie chargée / déchargée | kWh   | ET                                             |
| Température de l'onduleur   | °C    | local                                          |
| Tension réseau              | V     | local                                          |

## Scènes

Déclencheurs :

- **Production solaire démarrée / arrêtée** (lever, coucher du soleil ;
  l'énergie du jour est disponible en variable) ;
- **Surplus solaire / Fin du surplus solaire** : la puissance injectée dépasse
  le seuil de la configuration (500 W par défaut). Idéal pour lancer le
  chauffe-eau, un lave-linge ou la recharge de la voiture ;
- **Défaut de l'onduleur** (code et description de l'erreur en variables) ;
- **Onduleur injoignable / de nouveau joignable**.

Actions :

- **Lire l'onduleur GoodWe** : valeurs fraîches utilisables dans les actions
  suivantes (production, réseau, consommation, batterie) ;
- **Changer le mode de fonctionnement GoodWe** (famille ET : général, secours,
  éco, écrêtement, autoconsommation) ;
- **Limiter l'injection GoodWe** (en W, 0 = injection nulle) ;
- **Régler la profondeur de décharge GoodWe** (%).

Les réglages nécessitent la connexion locale. Une action que l'onduleur ne sait
pas faire renvoie **Appliqué = non** au lieu d'échouer : testez-le dans la
scène.

## Widgets de tableau de bord

- **Onduleur GoodWe** : tuiles en direct solaire, maison, réseau et batterie,
  état de l'onduleur, connexion et bouton Actualiser ;
- **Production GoodWe** : courbe de production et de consommation (24 h à un
  mois) et bilan énergétique du jour (produit, soutiré, injecté, autonomie).

## Dépannage

- **Aucun onduleur trouvé** : vérifiez que l'onduleur répond dans
  l'application SEMS, saisissez son adresse IP et autorisez le port UDP 8899
  entre Gladys et l'onduleur. Certains modules récents ne parlent qu'au cloud :
  utilisez alors le compte SEMS.
- **Cloud : « connexion refusée »** : vérifiez l'e-mail et le mot de passe sur
  semsportal.com. Le portail limite le rythme des requêtes : après un message
  « ralentir », l'intégration attend 5 minutes d'elle-même.
- **Pas de valeurs réseau / consommation** : un onduleur réseau (DT) a besoin
  d'un compteur intelligent GoodWe pour les fournir.

GoodWe est une marque de GoodWe Technologies Co., Ltd. Cette intégration
communautaire n'est pas affiliée à GoodWe.
