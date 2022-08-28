const
  LOCALITIES_EXCEL_FILE_URL = 'https://www.cbs.gov.il/he/publications/doclib/2019/ishuvim/bycode2021.xlsx',
  LOCALITY_CODES_EXCEL_FILE_URL = 'https://www.cbs.gov.il/he/publications/doclib/2019/ishuvim/index2021.xlsx',
  LOCALITY_CHANGES_EXCEL_FILE_URL = 'https://www.cbs.gov.il/he/publications/doclib/2019/ishuvim/changes-1948-2020.xlsx';

function getFilenameFromUrl(url) {
  return new URL(url).pathname.replace(/^\//, '').split('/').join('_');
}

export default [{
  name: 'localities',
  url: LOCALITIES_EXCEL_FILE_URL,
  filename: getFilenameFromUrl(LOCALITIES_EXCEL_FILE_URL),
  sheets: [{
    startRow: 1,
    map: {
      'סמל יישוב': 'id',
      'שם יישוב': 'name',
      'שם יישוב באנגלית': 'nameEn',
      districtObject: {
        district: {
          'סמל מחוז': 'id',
          'שם מחוז': 'name'
        }
      },
      subDistrictObject: {
        subDistrict: {
          'סמל נפה': 'id',
          'שם נפה': 'name'
        }
      },
      'אזור טבעי': 'naturalRegionId',
      municipalStatusObject: {
        municipalStatus: {
          'סמל מעמד מונציפאלי': 'id',
          'שם מעמד מונציפאלי': 'name'
        }
      },
      'אשכול רשויות מקומיות': 'localAuthoritiesClusterId',
      'צורת יישוב שוטפת': 'typeOfLocalityId',
      'קואורדינטות': 'coordinates',
      'סך הכל אוכלוסייה 2021': 'population'
    }
  }]
},
{
  name: 'localityCodes',
  url: LOCALITY_CODES_EXCEL_FILE_URL,
  filename: getFilenameFromUrl(LOCALITY_CODES_EXCEL_FILE_URL),
  sheets: {
    'רשימת הגליונות בקובץ זה': { transform: { skip: true } },
    'מחוז ונפה': {
      transform: {
        startRow: 4, // one-based
        columns: ['תת-נפה', 'נפה', 'מחוז', 'סמל נפה', 'סמל מחוז'],
        dragValuesForColumnIndices: [2, 4] // zero-based
      },
      map: {
        'נפה': 'subDistrict',
        'מחוז': 'district',
        'סמל נפה': 'subDistrictId',
        'סמל מחוז': 'districtId'
      }
    },
    'מעמד מוניציפלי': { transform: { skip: true } },
    'אזור טבעי': {
      transform: {
        startRow: 3, // one-based
        dragValuesForColumnIndices: [2] // zero-based
      },
      map: {
        'סמל': 'id',
        'שם האזור הטבעי': 'name',
        'נפה': 'subDistrict'
      }
    },
    'דת היישוב': { transform: { skip: true } },
    'ועדות תכנון': { transform: { skip: true } },
    'שיוך מטרופוליני': { transform: { skip: true } },
    'צורת יישוב': {
      transform: {
        startRow: 4, // one-based
        idColumn: 3, // one-based
        columns: ['צורת יישוב', 'סוג היישוב', 'סמל'],
        dragValuesForColumnIndices: [1] // zero-based
      },
      map: {
        'סמל': 'id',
        'סוג היישוב': 'group',
        'צורת יישוב': 'form'
      }
    },
    'השתייכות אירגונית': { transform: { skip: true } },
    'תחנות משטרה': { transform: { skip: true } },
    'אשכול רשויות מקומי': {
      transform: {
        startRow: 4, // one-based
        columns: ['שם אשכול', 'סמל אשכול']
      },
      map: {
        'סמל אשכול': 'id',
        'שם אשכול': 'name'
      }
    }
  }
},
{
  name: 'localityChanges',
  url: LOCALITY_CHANGES_EXCEL_FILE_URL,
  filename: getFilenameFromUrl(LOCALITY_CHANGES_EXCEL_FILE_URL),
  sheets: [{
    startRow: 1,
    map: {
      'סוג השינוי': 'type',
      'סמל נוכחי (אם יש)': 'localityId',
      'שם היישוב הנוכחי': 'localityName',
      'הסמל שבוטל או קדם לשינוי': 'previousLocalityId',
      'שמות/כינויים קודמים/זמניים או שכונות הכלולות ביישובים': 'previousLocalityName',
      'שנת השינוי': 'yearOfChange'
    }
  }]
}];