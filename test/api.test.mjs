import { test, describe } from 'node:test';
import assert from 'node:assert';

describe("Testing API endpoint", function () {
  test("running tests on API", async function (t) {
    const API_ENDPOINT = "http://localhost:8300/v3";

    await t.test("testing /metadata", async (t) => {
      const request = await fetch(API_ENDPOINT + "/metadata", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.equal(body.machinetypes.values.length >= 30, true);
    })

    await t.test("testing /games - 2259", async (t) => {
      const request = await fetch(API_ENDPOINT + "/games/2259?mode=tiny", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body._id, "0002259");
    })

    await t.test("testing /games - 0002259 (prefixed with zero's)", async (t) => {
      const request = await fetch(API_ENDPOINT + "/games/0002259?mode=tiny", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body._id, "0002259");
    })

    await t.test("testing /filecheck - Old Tower(0034458) - sha512, two sourcs", async (t) => {
      const request = await fetch(API_ENDPOINT + "/filecheck/5e7b4399056dee8b987d8de1d6d91d65d3a6cd665023c8ba57ac2d61acc7dae29d8711d333903082a462d6e80bfd5d7306336d6e58243339f30165aaff9faf56", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body.entry_id, "0034458");
      assert.deepStrictEqual(body.file[0].source, "TOSEC 2020");
      assert.deepStrictEqual(body.file[1].source, "spectrumcomputing.co.uk");
    })

    await t.test("testing /filecheck - 3D Monster Maze(0028617) - sha512, ZX81 STUFF", async (t) => {
      const request = await fetch(API_ENDPOINT + "/filecheck/412b28086cbe44d3054b8649c43c67c4318f46e7a9e8f35e7468e734f934d541390aced5a1f486beb4929cb2440a557fcbd10a41703e292834b386e4490fa512", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body.entry_id, "0028617");
      assert.deepStrictEqual(body.file[0].source, "ZX81 STUFF");
    })

  });

  test("running tests on SOURCES", async function (t) {
    const API_ENDPOINT = "http://localhost:8300/v3";

    await t.test("SOURCE: ZX81 STUFF, testing 3D Monster Maze(0028617)", async (t) => {
      const request = await fetch(API_ENDPOINT + "/filecheck/412b28086cbe44d3054b8649c43c67c4318f46e7a9e8f35e7468e734f934d541390aced5a1f486beb4929cb2440a557fcbd10a41703e292834b386e4490fa512", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body.entry_id, "0028617");
      assert.deepStrictEqual(body.file[0].source, "ZX81 STUFF");
    })

    await t.test("SOURCE: NVG, 180(0000015)", async (t) => {
      const request = await fetch(API_ENDPOINT + "/filecheck/eaf4781b93906240eb929aac582c5126c2a915280e3f8c4162217c616ef93526eca82fda66977be66baf07f5389fd1a8d5758cc62995416169f05bcc6d30933a", {
        method: 'GET',
      });
      assert.strictEqual(request.status, 200);
      const body = await request.json();
      assert.deepStrictEqual(body.entry_id, "0000015");
      assert.deepStrictEqual(body.file[0].source, "ftp.nvg.unit.no");
    })

  });
});