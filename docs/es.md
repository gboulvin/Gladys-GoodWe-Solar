# Integración GoodWe

Siga su instalación solar GoodWe en Gladys: producción solar, consumo de la
casa, importación/exportación de red y batería, en directo, con escenas y
widgets del panel.

## Inversores compatibles

| Familia               | Modelos                                    | Local (red)  | Nube SEMS |
| --------------------- | ------------------------------------------ | ------------ | --------- |
| ET (híbrido, batería) | ET, EH, BT, BH, ET Plus, EHA/ESA G20, GEH… | ✅ + ajustes | ✅        |
| ES (híbrido, batería) | ES, EM, BP, SBP                            | ✅ + ajustes | ✅        |
| DT (conexión a red)   | DT, SDT, MT, MS, D-NS, XS, GEP…            | ✅           | ✅        |

El inversor necesita su módulo WiFi o LAN GoodWe (Wi-Fi Kit, WiFi/LAN Kit,
Ezlink…) conectado a su red doméstica.

## Dos formas de llegar al inversor

**Local (recomendada).** Gladys habla directamente con el inversor en su red
(puerto UDP 8899): valores cada minuto, energía del día, índices de los
contadores, temperatura y ajustes disponibles en escenas. Sin cuenta, sin
Internet.

**Nube SEMS (opcional).** La cuenta del portal SEMS / de la app SEMS+.
Funciona cuando Gladys no está en la misma red que el inversor y sirve de
respaldo cuando falla la conexión local. Solo lectura, actualizada cada 5
minutos (el portal limita las peticiones más frecuentes).

Con ambas, cada inversor es **un solo** dispositivo: leído en local, pasa a la
nube si se pierde la conexión local (un punto naranja en la insignia «nube» lo
indica) y vuelve. La opción estándar **Preferir la conexión local** elige el
canal que se prueba primero.

## Configuración

1. Instale la integración desde **Integraciones → GoodWe**.
2. Conexión local:
   - deje activada **Buscar inversores GoodWe en la red**;
   - si no se encuentra el inversor (otra subred, VLAN, router que bloquea la
     difusión), introduzca su **dirección IP** y fíjela en el router (reserva
     DHCP).
3. Nube (opcional): **correo electrónico** y **contraseña** de su cuenta SEMS.
   Consejo: cree una cuenta de _visitante_ dedicada en la app SEMS.
4. Pulse **Probar la conexión**: cada inversor encontrado aparece con su modelo
   y número de serie.
5. Abra la pestaña **Descubrimiento** y añada sus inversores.

## Funciones del dispositivo

Producción solar (W), producción del día / total (kWh), potencia de red (W,
importación > 0, exportación < 0, contador necesario), índices de importación /
exportación (kWh), consumo de la casa (W), nivel de batería (%), potencia de
carga / descarga (W), energía cargada / descargada (kWh), temperatura del
inversor (°C), tensión de red (V), según el modelo y la conexión.

## Escenas

Activadores: **Producción solar iniciada / detenida**, **Excedente solar
iniciado / terminado** (potencia inyectada por encima del umbral de la
configuración, 500 W por defecto), **Avería del inversor**, **Inversor
inaccesible / accesible de nuevo**.

Acciones: **Leer el inversor GoodWe** (valores frescos para las acciones
siguientes), **Cambiar el modo de funcionamiento GoodWe** (familia ET),
**Limitar la exportación GoodWe** (W), **Ajustar la profundidad de descarga
GoodWe** (%). Los ajustes requieren la conexión local; si el inversor no puede
realizar una acción, devuelve **Aplicado = no**.

## Widgets del panel

- **Inversor GoodWe**: mosaicos en directo solar, casa, red y batería, estado,
  conexión y botón Actualizar;
- **Producción GoodWe**: gráfico de producción y consumo (24 h a un mes) y
  balance energético del día.

## Solución de problemas

- **Ningún inversor encontrado**: introduzca su dirección IP y permita el
  puerto UDP 8899 entre Gladys y el inversor. Algunos módulos recientes solo
  hablan con la nube: use entonces la cuenta SEMS.
- **Nube: «inicio de sesión rechazado»**: compruebe el correo y la contraseña
  en semsportal.com. Tras una limitación, la integración espera 5 minutos por
  sí misma.

GoodWe es una marca de GoodWe Technologies Co., Ltd. Esta integración
comunitaria no está afiliada a GoodWe.
