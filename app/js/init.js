'use strict';
/*jshint -W083 */

var helpers = require('./services/helpers.js');
var config = require('./services/config.js');
var df = config.startForm;
var icao = require('./services/icao.js');
var dbdata = {};
var $inputs = $('#controls').find("[id]");
var moment = require('moment');
console.log($inputs);

module.exports = {

  init: function() {

    initForm(triggerChange);

    //***********************************************************************

    function initForm(callback) {

      // load carrier control

      // carriers = carriers module
      $.each(icao.carriers, function(i, obj) {
        var name = obj.carrier + '   ' + obj.carriername;
        $('#carrier').append(new Option(name, obj.carrier, true, true));
      });

      // load airports select
      var airport = $('select[name=airport]');
      $.each(icao.airports, function(i, obj) {
        var name = obj.id + '   ' + obj.name;
        airport.append(new Option(name, obj.id));
      });
      airport.val(config.defAirport);

      // load delay select
      var delays = config.delays;
      var delay = $('select[name=delay]');
      $.each(delays, function(i, obj) {
        var period = (obj[0] > 0 && obj[0] < 1.5) ? ' hour' : ' hours';
        delay.append(new Option(obj[1] + period, obj[0]));
      });
      delay.val(config.delay);

      //initialize form controls:

      //setup datepicker
      var date_input = $('input[name="startDate"]');
      var today = new Date();
      var options = {
        setDate: today,
        format: 'yyyy-mm-dd',
        container: 'container',
        todayHighlight: true,
        autoclose: true,
      };
      date_input.datepicker(options).datepicker("update", today);

      //init other controls

      $('#numDays').val(df.numDays);
      $('#airport').val(df.airport);
      $('#arrivals').prop('checked', df.arrivals);
      $('#departures').prop('checked', df.departures);
      $('#international').prop('checked', df.international);
      $('#domestic').prop('checked', df.domestic);
      //$('#carrier').val set in load carriers control;
      $('#delay').val(df.delay);

      // inputs onChange handler

      var formChanged = function(e) {
        var data = getFormData($inputs);
        if (["startDate", "numDays", "airport"].indexOf(e.target.name) > -1) {
          getFlightData(data, updateDisplayData);
        } else {
          updateDisplayData(data);
        }
      };

      $inputs.on('change', formChanged);

      //  $('select').selectr();

      callback(); // cb triggerChanged

    } // function initForm end;

    //***********************************************************************

    function triggerChange() {
      $('#numDays').triggerHandler('change');
    }

    //get form data and then GET flight data based on those choices;
    //called from / returned to $inputs.onChange handler;
    function getFormData(controls) { //********** , callback
      var key, val;
      var formVals = {};
      controls.each(function() {
        key = $(this).prop("id");
        val = ($(this).prop("type") == "checkbox") ? $(this).is(':checked') : $(this).val();
        formVals[key] = val;
      });
      return formVals;
    }

    //***********************************************************************

    // flight data ajax call to server api - uses server route to postgres function;
    function getFlightData(model, callback) { //called from init and $input.onChange

      var q = { // query string
        q: model.startDate,
        d: model.numDays,
        a: model.airport
      };
      var url = 'http://localhost:3000/flights/all';

      $.ajax({
        url: url,
        data: q,
        dataType: "json",

        success: function(result) {

          //divide into two datasets on orig/dest = airport
          var resData = { arrData: [], depData: [] };
          var splitData = result.map(function(obj) {
            if (obj.orig == model.airport) {
              resData.depData.push(obj);
            } else {
              resData.arrData.push(obj);
            }
          });

          dbdata = result; // store result for continued use;
          callback(model); // cb updateDisplayData
        },

        error: function(request, status, error) {
          console.log('ERROR:', request.body, status, request.status, request.responseText);
        }
      });
    }

    //***********************************************************************

    // update Display called from $input.onChange and getFlightData as cb; provides filter with modelChange() for displayed data (calls exposeData);

    function updateDisplayData(form) {
      console.log('form from updateDisplayData: ', form);
      var currData = dbdata.filter(modelChanged(form));
      console.log('filtered from updateDisplayData: ', currData);
      //callback(currData);
      exposeData(currData, form);
    }

    //***********************************************************************

    function modelChanged(form) { //filter fn for dbdata.filter
      console.log('form from modelChanged: ', form);
      var criteria;
      return function(obj) {
        //choose arrivals/departures/both
        if (form.departures) {
          if (form.arrivals) {
            criteria = true;
          } else {
            criteria = (obj.orig == form.airport);
          }
        } else if (form.arrivals) {
            criteria = (obj.dest == form.airport);
        }
        //return carrier in selected AND arrivals/departures
        return (form.carrier.indexOf(obj.car) > -1) && criteria;
      };
    }

    //***********************************************************************

    function exposeData(data, form) {

      function panelInfo(data, format) { // info in panel header
        var counta = 0,
            countd = 0;
        $.each(data, function(i, obj) {
          if (obj.orig == form.airport) {
            countd += 1;
          } else if (obj.dest == form.airport) {
            counta += 1;
          }
        });
        var start = moment(form.startDate);
        var end = moment(start).add(form.numDays - 1, 'days');

        var arrdep = function(form) { // counts arrivals & departures separately
          if (form.arrivals) {
            if (form.departures) {
              return counta + ' Flights <span style="color:#008000"><em>Arriving at</em></span> & ' + countd + ' Flights <span style="color:#0000CD"><em>Departing from</em></span> ';
            } else {
              return counta + ' Flights <span style="color:#008000"><em>Arriving at</em></span> ';
            }
          } else if (form.departures) {
            return countd + ' Flights <span style="color:#0000CD"><em>Departing from</em><span> ';
          }
        };
        var daterange = (!end.isAfter(start)) ? start.format('LL') : start.format('LL') + ' to ' + end.format('LL');
        var str = (data.length > 0) ? '<strong>' + daterange + '</strong>' + ' &nbsp&nbsp&nbsp' + arrdep(form) + form.airport : '';

        $('#panelInfo span').html(str);

      } // fn panelInfo

      //***********************************************************************

      makeTable(data, form);
      panelInfo(data, form);
      //graphInfo(data); // TODO need to correct arrival dates for value of next;

    } // fn exposeData

    //***********************************************************************

    //create table using filtered data from updateDisplayData via exposeData

    function makeTable(celldata, formvals) { // build table to display charted records

      var tmap = config.tableMap;
      var content = '<tbody>';

      for (var i = 0; i < tmap.length; i++) {
        var colhead = tmap.filter(function(obj) {
          return obj.pos == i;
        });

        content += '<th>' + colhead[0].title + '</th>';
      }
      $.each(celldata, function(index, val) {

        if (val.dest == formvals.airport) {
          content += '<tr style="color:#008000">';
        } else {
          content += '<tr style="color:#0000CD">';
        }

        for (var i = 0; i < tmap.length; i++) {
          var mapobj = tmap.filter(function(obj) {
            return obj.pos == i;
          });
          content += '<td>' + val[mapobj[0].data] + '</td>';
        }
        content += '</tr>';
      });

      content += '</tbody>';

      $('#flightTable').html(content);
    }

    // function graphPre(data) {
    //   var graphData = data.map(function(obj) {
    //     obj.isoDate = obj.ddate+'T'+obj.dep;
    //     return obj;
    //   }).sort(function(a, b) {
    //     var timea = new Date(a.isoDate).getTime();
    //     var timeb = new Date(b.isoDate).getTime();
    //     return timea - timeb;
    //   });
    //   return graphData;
    // }

    // function graphData(data) {
    //   // aggregate over time
    //    var interval = '15m';
    //   var blockTime = startDate+'T'+00:00:00 plus interval;
    //   var graphData = data.map(function(obj) {
    //     if data.isoDate <= blockTime {
    //       pax += data.seats;
    //     } else {
    //       blockTime += interval;
    //       return {timeBlock:blockTime, pax:pax};
    //     }
    //   });

    // }
  }
};
