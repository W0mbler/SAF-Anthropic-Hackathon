"""Exercise the real API, solver, persistence, exports and guest isolation."""
import argparse
import http.cookiejar
import json
import math
import urllib.error
import urllib.request
from collections import defaultdict


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    base = args.url.rstrip('/')
    session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(path, data=None, csrf=None, opener=session):
        headers = {'Accept': 'application/json'}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        if csrf:
            headers['X-CSRF-Token'] = csrf
        req = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        with opener.open(req, timeout=90) as response:
            body = response.read()
            return json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else body.decode()

    request('/health')
    csrf = request('/api/v1/auth/me')['csrf_token']
    locations = request('/api/v1/locations')
    assert len(locations['sources']) == 80
    assert math.isclose(sum(source['production_kilotons'] for source in locations['sources']), 6800)
    assert {airport['id'] for airport in locations['airports']} == {'PNK', 'PKN', 'BPN', 'TRK'}
    inputs = {
        'name': 'Smoke baseline', 'demand': {'PNK': 60, 'PKN': 30, 'BPN': 90, 'TRK': 30},
        'conversion_yield': 0.2, 'horizon_years': 1, 'discount_rate': 0,
        'distance_multiplier': 1, 'processing_opex': {'small': 0, 'large': 0},
        'excluded_candidate_ids': [],
    }
    runs = []
    for name, demand in [('Smoke baseline', inputs['demand']), ('Smoke higher demand', {'PNK': 70, 'PKN': 40, 'BPN': 110, 'TRK': 40})]:
        scenario = request('/api/v1/scenarios', {**inputs, 'name': name, 'demand': demand}, csrf)
        run = request(f"/api/v1/scenarios/{scenario['id']}/solve", {}, csrf)
        assert run['feasible'] and run['objective_usd'] > 0, run
        assert {flow['stage'] for flow in run['flows']} == {'farm_depot', 'depot_refinery', 'refinery_airport'}
        received = defaultdict(float)
        for flow in run['flows']:
            assert flow['quantity_kt'] >= 0
            if flow['stage'] == 'refinery_airport':
                received[flow['to_node_id']] += flow['quantity_kt']
        for airport, quantity in demand.items():
            assert math.isclose(received[airport], quantity, abs_tol=1e-5)
        biomass = sum(f['throughput_input_kt'] for f in run['facilities'] if f['facility_type'] == 'refinery')
        assert math.isclose(biomass * 0.2, sum(demand.values()), abs_tol=1e-5)
        persisted = request(f"/api/v1/runs/{run['id']}")
        assert persisted['input_hash'] == run['input_hash']
        export = request(f"/api/v1/runs/{run['id']}/export?format=json")
        assert export['id'] == run['id']
        assert request(f"/api/v1/runs/{run['id']}/export?format=csv")
        explanation = request(f"/api/v1/runs/{run['id']}/explain", {'use_ai': False}, csrf)
        assert explanation['source'] == 'deterministic' and explanation['summary']
        runs.append(run)
    comparison = request('/api/v1/compare', {'left_run_id': runs[0]['id'], 'right_run_id': runs[1]['id']}, csrf)
    assert math.isclose(comparison['delta']['demand_saf_kt'], 50)
    assert comparison['delta']['objective_usd'] > 0
    stranger = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    request('/api/v1/auth/me', opener=stranger)
    try:
        request(f"/api/v1/runs/{runs[0]['id']}", opener=stranger)
    except urllib.error.HTTPError as error:
        assert error.code == 404
    else:
        raise AssertionError('A different guest could read a private run')
    print('PASS: seeded data, baseline + higher solves, all flow stages, mass balance, persistence, compare, explanation, JSON/CSV export, guest isolation')


if __name__ == '__main__':
    main()
