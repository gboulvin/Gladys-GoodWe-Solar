# Test fixtures

Raw UDP answers captured on real GoodWe inverters, from the test samples of the
[`goodwe`](https://github.com/marcelblijleven/goodwe) Python library
(MIT licence, Copyright (c) 2021 Marcel Blijleven):

| File                  | Inverter         | Request                        |
| --------------------- | ---------------- | ------------------------------ |
| `et_device_info.hex`  | GW10K-ET (fw617) | Modbus read 35000 x 33         |
| `et_running_data.hex` | GW10K-ET         | Modbus read 35100 x 125        |
| `et_battery_info.hex` | GW10K-ET         | Modbus read 37000 x 24         |
| `dt_device_info.hex`  | GW17KT-DT        | Modbus read 30001 x 40         |
| `dt_running_data.hex` | GW17KT-DT        | Modbus read 30100 x 73         |
| `es_device_info.hex`  | GW5048D-ES       | AA55 identification (`010200`) |
| `es_running_data.hex` | GW5048D-ES       | AA55 runtime data (`010600`)   |

The expected values in the tests are the ones the `goodwe` library decodes from
the same frames.
