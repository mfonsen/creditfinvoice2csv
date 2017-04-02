'use strict'

var Promise = require('bluebird')
var join = Promise.join
var fs = Promise.promisifyAll(require('fs'))
var xml2js = Promise.promisifyAll(require('xml2js'))
var iconv = require('iconv-lite')
var papaparse = require('papaparse')
const BASE_PATH = './secret/'
const ARTICLE_ID_SPLITTER = new RegExp(/^([^ ]+) ([^ ]+) ([^ ]+) (.+)$/)
var _ = require('lodash')

fs.readdirAsync(BASE_PATH).map(function (fileName) {
  var filePath = BASE_PATH + fileName
  var stat = fs.statAsync(filePath)
  var contents = fs.readFileAsync(filePath).catch(function ignore () { })
    .then((contentBuffer) => {
      //xml2js does not do character encoding
      return xml2js.parseStringAsync(iconv.decode(contentBuffer, 'ISO-8859-15'))
    })
  return join(stat, contents, function (stat, contents) {
    return {
      stat,
      filePath,
      fileName,
      contents
    }
  })
  // The return value of .map is a promise that is fulfilled with an array of the mapped values
  // That means we only get here after all the files have been statted and their contents read
  // into memory. If you need to do more operations per file, they should be chained in the map
  // callback for concurrency.
})
  .call('sort', function (a, b) {
    return a.fileName.localeCompare(b.fileName)
  })
  .map(function (file) {
    return file.contents.Finvoice.InvoiceRow
    // skips items that are not for bought items
    .filter((row) => ['Kokonaissaldo', 'Suoritus', 'Viivästyskorko'].indexOf(row.ArticleIdentifier[0]) === -1)
    .map((row) => {
      let ArticleIdentifierMatch = row.ArticleIdentifier[0].match(ARTICLE_ID_SPLITTER)
      if (!ArticleIdentifierMatch) throw new Error(`'Unknown format in ArticleIdentifier ${row.ArticleIdentifier[0]}`)
      return {
        buyer: file.contents.Finvoice.BuyerPartyDetails[0].BuyerOrganisationName[0],
        seller: ArticleIdentifierMatch[4].trim(),
        city: ArticleIdentifierMatch[3],
        country: ArticleIdentifierMatch[2],
        type: ArticleIdentifierMatch[1],
        amount: parseFloat(row.RowAmount[0]._.replace(',', '.')),
        currency: row.RowAmount[0].$.AmountCurrencyIdentifier.trim(),
        card: row.ArticleName[0],
        date: row.RowDeliveryDate[0]._,
        fileName: file.fileName
      }
    })
  })
  .then((data) => {
    return _.flatten(data)
  })
  .map((row) => {
    return [row.date, row.type, row.currency, row.amount, row.buyer, row.seller, row.country, row.city, row.card, row.fileName]
  })
  .then((data) => {
    data.unshift(['date', 'type', 'currency', 'amount', 'buyer', 'seller', 'country', 'city', 'card', 'fileName'])
    data = papaparse.unparse(data)
    // console.log(JSON.stringify(data, null, '  '))
    console.log(data)
  })
  .catch((err) => console.log(err))
