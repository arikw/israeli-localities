import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import ItmToWgs84Converter from 'itm-to-wgs84-converter';
import { writeCsvFile, fetchRemoteData, getAbsolutePath } from './utils.js';
import descriptors from './excel-file-descriptors.js';

function getLocalityMergers(localityChanges) {
  
  let mergers = [];

  localityChanges
    .filter(c => ['שינוי שם', 'שינוי שם וסמל'].includes(c.type))
    .filter(c => c.yearOfChange)
    .map(c => (c.localityId = parseInt(c.localityId), c))
    .map(c => (c.previousLocalityId = parseInt(c.previousLocalityId), c))
    .map(c => (c.yearOfChange = parseInt(c.yearOfChange), c));

  const mergersAndSplits = localityChanges
    .filter(c => ['פירוק איחוד', 'אוחד', 'אוחד עם עוד יישובים', 'פיצול איחוד'].includes(c.type))
    .map(c => (c.type = (c.type.includes('אוחד') ? 'איחוד' : 'פיצול'), c))
    // .filter(c => c.yearOfChange > 2000)
    .map(c => (c.localityId = parseInt(c.localityId), c))
    .map(c => (c.previousLocalityId = parseInt(c.previousLocalityId), c))
    .map(c => (c.yearOfChange = parseInt(c.yearOfChange), c))
    .sort((a, b) => a.yearOfChange - b.yearOfChange); // ascending year

  for (const rec of mergersAndSplits) {
    const previousChange = mergers.find(m => m.localityId === rec.localityId);
    if (!previousChange || previousChange.type !== rec.type) {
      mergers = mergers.filter(c => (c.localityId !== rec.localityId));
    }
    // no duplicates
    if (!mergers.find(m => ((m.localityId === rec.localityId) && (m.previousLocalityName === rec.previousLocalityName)))) {
      mergers.push(rec);
    }
  }

  mergers = mergers.filter(c => c.type.includes('איחוד'));

  return mergers;

}

function getLocalityRenames(localityChanges) {  

  return localityChanges
    .filter(c => ['שינוי שם', 'שינוי שם וסמל'].includes(c.type))
    .map(c => (c.localityId = parseInt(c.localityId), c))
    .map(c => (c.previousLocalityId = parseInt(c.previousLocalityId), c))
    .map(c => (c.yearOfChange = parseInt(c.yearOfChange), c));
}

async function createFinalFiles({ localities: allLocalities, localityCodes, localityChanges }) {
  
  const localities = allLocalities
    // no places without coordinates
    .filter(locality => locality.coordinates)
    // no military bases
    .filter(locality => !(locality.name.includes('*') && locality.name.includes('מחנה ')))
    // no non-populated places that are missing a municipal status
    .filter(locality => (locality.population || locality.municipalStatus?.id))
    // no working centers
    .filter(locality => (locality.typeOfLocalityId !== 520))
    // no regional places
    .filter(locality => (locality.typeOfLocalityId !== 530));

  const distDirPath = getAbsolutePath('../dist');

  const mergedLocalities = getLocalityMergers(localityChanges);
  for (const merger of mergedLocalities) {
    const locality = localities.find(l => l.id === merger.localityId);
    if (locality && merger.previousLocalityName) {
      locality.mergedLocalityNames = (locality.mergedLocalityNames || []);
      locality.mergedLocalityNames.push(merger.previousLocalityName);
    }
  }

  const renamedLocalities = getLocalityRenames(localityChanges);
  for (const rename of renamedLocalities) {
    const locality = localities.find(l => l.id === rename.localityId);
    if (locality && rename.previousLocalityName) {
      locality.previousNames = (locality.previousNames || []);
      locality.previousNames.push(rename.previousLocalityName);
    }
  }
  
  for (const locality of localities) {

    locality.name = locality.name
      .replace(/אל -([^\s])/, 'אל-$1')
      .replace(/\s-([^\s])/, '-$1')
      .replace('*', '')
      .trim();

    locality.nameEn = locality.nameEn
      ?.replace(/([^\s])-\s/, '$1-');

    if (locality.naturalRegionId) {
      const naturalRegion = localityCodes['אזור טבעי'].find(item => item.id === locality.naturalRegionId);
      if (!naturalRegion) { continue; }
      locality.naturalRegion = {
        id: locality.naturalRegionId,
        name: naturalRegion.name
      };
      delete locality.naturalRegionId;
    }

    // type of locality
    if (locality.typeOfLocalityId) {
      const typeOfLocality = localityCodes['צורת יישוב'].find(item => item.id === locality.typeOfLocalityId);
      if (!typeOfLocality) { continue; }
      locality.typeOfLocality = {
        id: locality.typeOfLocalityId,
        group: typeOfLocality.group,
        form: typeOfLocality.form
      };
      delete locality.typeOfLocalityId;
    }

    // authorities cluster
    if (locality.localAuthoritiesClusterId) {
      const localAuthoritiesCluster = localityCodes['אשכול רשויות מקומי'].find(item => item.id === locality.localAuthoritiesClusterId);
      if (!localAuthoritiesCluster) { continue; }
      locality.localAuthoritiesCluster = {
        id: locality.localAuthoritiesClusterId,
        name: localAuthoritiesCluster.name
      };
      delete locality.localAuthoritiesClusterId;
    }

    // coordinates
    if (locality.coordinates) {
      const itm = String(locality.coordinates);
      const east = parseInt(itm.slice(0, 5) + '0');
      const north = parseInt(itm.slice(5, 10) + '0');
      const [ latitude, longitude ] = ItmToWgs84Converter.itm2wgs84(east, north);
      locality.coordinates = {
        itm: { east, north },
        wgs84: { latitude: Math.round(latitude * 1e5) / 1e5, longitude: Math.round(longitude * 1e5) / 1e5 }
      };
    }

    // const alternativeNames = [];
    // if (
    //   (locality.typeOfLocality?.group === 'יישוב עירוני') &&
    //  (
    //    ((locality.name.split('-').length - 1) > 1) || // has more then one hyphen
    //    (locality.name.includes(' ') && ((locality.name.split('-').length - 1) === 1))
    //  ) &&
    //  !locality.name.includes(' אל-') &&
    //  !locality.name.includes(' א-')
    // ) {
    //   alternativeNames.push(...locality.name.split('-').map(n => n.trim()));
    //   alternativeNames.push(locality.name.replace(/\s*-\s*/g, ' ').trim());
    // }
    // if ((parsedData.map(l => l.name)).some(r => alternativeNames.includes(r))) {
    //   console.log(`skipping ${alternativeNames.join(',')}`);
    // }
    
    // if (
    //   locality.name.split('(')[0].includes('יי') &&
    //   !locality.name.includes('"') &&
    //   !locality.name.includes('חיים')
    // ) {
    //   alternativeNames.push(locality.name.replace(/יי/g, 'י'));
    // }

    // if (alternativeNames.length > 0) {
    //   alternativeNames.push(...alternativeNames.filter(n => n.includes('יי')).map(n => n.replace(/יי/g, 'י')));
    // }

    // if ((locality.typeOfLocality.form === 'קיבוצים')) {
    //   alternativeNames.push(`קיבוץ ${locality.name.replace('(קיבוץ)', '').trim()}`);
    // }
    
    // if ((locality.typeOfLocality.form === 'מושבים') && !locality.name.includes('מושבה')) {
    //   alternativeNames.push(`מושב ${locality.name.replace('(מושב)', '').trim()}`);
    // }

    // // add alternative names only if doesn't collide with other locality names or alternative names
    // if (alternativeNames.length > 0) {
    //   const localityWithSameAltNames = parsedData
    //     .filter(loc => loc.alternativeNames)
    //     .find(loc => loc.alternativeNames.some(r => alternativeNames.includes(r)));
    //   if (localityWithSameAltNames) {
    //     // remove the alternative names
    //     delete localityWithSameAltNames.alternativeNames;
    //     console.log(`skipping2 ${alternativeNames.join(',')}`);
    //   } else {
    //     // add alternative names
    //     locality.alternativeNames = alternativeNames;
    //   }
    //   locality.alternativeNames = alternativeNames;
    // }
    // if (locality.name.replace(/יי/g, 'י') !== locality.name) { alternativeNames.push(); }

  }

  // create dist folder  
  if (!existsSync(distDirPath)) { mkdirSync(distDirPath); }

  // save as json
  const jsonFilename = path.resolve(distDirPath, 'localities.json');
  console.log(`creating ${jsonFilename}...`);
  writeFileSync(jsonFilename, JSON.stringify(localities, null, '\t'));
  
  // save as yaml
  const yamlFilename = path.resolve(distDirPath, 'localities.yaml');
  console.log(`creating ${yamlFilename}...`);
  writeFileSync(yamlFilename, yaml.dump(localities));
  
  // save as csv
  const csvFilename = path.resolve(distDirPath, 'localities.csv');
  console.log(`creating ${csvFilename}...`);
  writeCsvFile(csvFilename, localities);

  console.log('done');
}

export default async function buildData() {
  const files = {};
  const cacheDirPath = getAbsolutePath('../cache');
  for (const descriptor of descriptors) {
    const data = await fetchRemoteData(descriptor, cacheDirPath);
    files[descriptor.name] = data;
    if (Array.isArray(data)) {
      console.log(`Got ${Object.keys(data).length} row(s) for "${descriptor.name}"`);
    } else {
      console.log(`Got ${Object.keys(data).length} sheet(s) for "${descriptor.name}"`);
    }
  }
  // const getDescriptor = name => descriptors.find(d => (d.name === name));
  // const localityCodes = await fetchRemoteData(getDescriptor('localityCodes'));
  // console.log(`Got ${Object.keys(localityCodes).length} sheet(s)`);

  await createFinalFiles(files);
}