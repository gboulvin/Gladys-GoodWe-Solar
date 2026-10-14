// A fake SEMS+ portal: an injectable `fetch` answering the routes the client
// uses, recording every request. Tests never touch the network.

export function createFakeSems({
  stations = [{ id: 'station-1', stationName: 'Home' }],
  inverters = { 'station-1': [{ sn: '9010KETU000W0000', name: 'Roof' }] },
  flow = { pSystem: 2.4, pBat: -1.1, pGrid: -0.5, pConsum: 1.8, soc: 62 },
  telemetry = [
    {
      factors: [
        { code: 'pAc', data: '1.5' },
        { code: 'Temperature', data: '41.5' },
      ],
    },
  ],
  loginCode = '00000',
} = {}) {
  const requests = [];
  const state = { loginCode, flow, expireNext: false, rateLimitNext: false, failAll: false };

  const reply = (body, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  async function fetchImpl(url, options = {}) {
    const { pathname, searchParams } = new URL(url);
    requests.push({
      url,
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
    });
    if (state.failAll) throw new Error('getaddrinfo ENOTFOUND');
    if (state.rateLimitNext) {
      state.rateLimitNext = false;
      return reply({}, 429);
    }
    if (pathname.endsWith('/auth/cross-login')) {
      if (state.loginCode !== '00000') {
        return reply({ code: state.loginCode, msg: 'account or password error' });
      }
      return reply({
        code: '00000',
        data: { uid: 'uid-1', timestamp: '1', token: 'token-1', client: 'semsPlusWeb' },
        api: 'https://eu-gateway.semsportal.com/web/sems',
      });
    }
    if (state.expireNext) {
      state.expireNext = false;
      return reply({ code: '100002', msg: 'token expired' });
    }
    if (pathname.endsWith('/portal/stations/page')) {
      return reply({ code: '00000', data: { dataList: stations } });
    }
    if (pathname.endsWith('/stations/device/all-status')) {
      const list = inverters[searchParams.get('stationId')] ?? [];
      return reply({
        code: '00000',
        data: {
          deviceDetailList: [
            {
              deviceType: 'INVERTER',
              statusDetailList: [
                {
                  status: 1,
                  snList: list.map((inverter) => inverter.sn),
                  detailMap: Object.fromEntries(list.map((inverter) => [inverter.sn, inverter])),
                },
              ],
            },
            { deviceType: 'SMART_METER', statusDetailList: [{ snList: ['METER1'] }] },
          ],
        },
      });
    }
    if (pathname.endsWith('/stations/flow')) {
      return reply({ code: '00000', data: state.flow });
    }
    if (pathname.includes('/equipments/') && pathname.endsWith('/telemetry')) {
      return reply({ code: '00000', data: telemetry });
    }
    return reply({ code: 'E404', msg: 'unknown route' });
  }

  const count = (fragment) => requests.filter((request) => request.url.includes(fragment)).length;

  return { fetchImpl, requests, state, count };
}
