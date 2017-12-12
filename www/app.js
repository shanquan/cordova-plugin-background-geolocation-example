var
  map,
  previousLocation,
  locationMarkers = [],
  stationaryCircles = [],
  currentLocationMarker,
  locationAccuracyCircle,
  posIcon,
  curIcon,
  path,
  userStartIntent,
  convertor,
  isStarted = false,
  isLocationEnabled = false,
  configHasChanges = false,
  mapHasChanges = false;

var bgOptions = {
  stationaryRadius: 50,
  distanceFilter: 50,
  desiredAccuracy: 10,
  debug: true,
  notificationTitle: 'Background tracking',
  notificationText: 'enabled',
  notificationIconColor: '#FEDD1E',
  notificationIconLarge: 'mappointer_large',
  notificationIconSmall: 'mappointer_small',
  locationProvider: 0,//backgroundGeolocation.provider.ANDROID_DISTANCE_FILTER_PROVIDER,
  interval: 10,
  fastestInterval: 5,
  activitiesInterval: 10,
  stopOnTerminate: false,
  startOnBoot: false,
  startForeground: true,
  stopOnStillActivity: true,
  activityType: 'AutomotiveNavigation',
  url: 'http://192.168.81.15:3000/locations',
  syncUrl: 'http://192.168.81.15:3000/sync',
  syncThreshold: 100,
  httpHeaders: {
    'X-FOO': 'bar'
  },
  pauseLocationUpdates: false,
  saveBatteryOnBackground: false,
  maxLocations: 100
};

try {
  Object.assign(bgOptions, JSON.parse(localStorage.getItem('bgOptions')));
  bgOptions.mapSelect = 'amap';
} catch (e) {
  //noop;
}


// Initialize app
var myApp = new Framework7({
  init: false,
  animateNavBackIcon: true,
  precompileTemplates: true,
  domCache: true,
  material: window.isAndroid,
  // fastclick: false
});

// We need to use custom DOM library, let's save it to $$ variable:
var $$ = Dom7;

var mainView = myApp.addView('.view-main');
var view1 = myApp.addView('#view-1');
var view2 = myApp.addView('#view-2');

myApp.onPageInit('map', function (page) {
  renderTabBar(isStarted);
  initialMap();
  if (typeof backgroundGeolocation === 'undefined') {
    myApp.alert('Plugin has not been initialized properly!', 'Error');
    return;
  }
  bgConfigure();
  backgroundGeolocation.onStationary(setStationary);
  backgroundGeolocation.watchLocationMode(
    function (enabled) {
      isLocationEnabled = enabled;
      if (enabled && userStartIntent) {
        startTracking();
      } else if (isStarted) {
        stopTracking();
        myApp.alert('Location tracking has been stopped');
      }
    },
    function (error) {
      myApp.alert(error, 'Error watching location mode');
    }
  );

  $$('#tabbar').on('click', '[data-action="tracking"]', function() {
    userStartIntent = !(isStarted & userStartIntent);
    toggleTracking(userStartIntent);
  });

});

myApp.onPageInit('settings', function (page) {
  var options = Object.assign({}, bgOptions);
  var locationProviders = [
    {name: 'ANDROID_DISTANCE_FILTER_PROVIDER', value: 0, selected: false, index: 0},
    {name: 'ANDROID_ACTIVITY_PROVIDER', value: 1, selected: false, index: 1},
  ];
  var selectedProvider = 0;

  if (options.locationProvider) {
    selectedProvider = Number(options.locationProvider);
    locationProviders[Number(options.locationProvider)].selected = true;
  }
  options.locationProvider = locationProviders[selectedProvider].name;
  options.locationProviders = locationProviders;

  $$('#settings').html(Template7.templates.settingsTemplate(options));

  $$('[data-action="back"]').click(function(ev) {
    if (configHasChanges||mapHasChanges) {
      var config = Array.prototype.reduce.call($$('[data-page="settings"] [data-type="config"]'),
        function(values, el) {
        if (el.type === 'checkbox') {
          values[el.name] = el.checked;
        } else {
          values[el.name] = el.value;
        }
        return values;
      }, {});
      bgConfigure(config);
      configHasChanges = false;
    }
  });

});

$$('[data-page="settings"]').on('keyup keydown change', '[data-type="config"]', function(ev) {
  console.log('changed', this.name, this.checked, this.value);
  if(this.name=="mapSelect"){
    mapHasChanges = true;
  }else{
    configHasChanges = true;
  }
});
function initialMap(){
  if(map!=undefined){
    map=null;
    var mapNode = document.getElementById('mapcanvas');
    mapNode.childNodes.forEach(function(node){
      mapNode.removeChild(node);
    })
  }
  if(bgOptions.mapSelect=='amap'){
    if (typeof AMap !== 'undefined') {
      map = new AMap.Map(Dom7('#mapcanvas')[0], {
        center: [116.404,39.915],
        zoom: 12
      });
      posIcon = new AMap.Icon({
        image:"poi.png",
        size:new AMap.Size(20,20),
        imageOffset:new AMap.Pixel(-39,-432)
      });
      curIcon = new AMap.Icon({
        image:"poi.png",
        size:new AMap.Size(20,20),
        imageOffset:new AMap.Pixel(-39,-409)
      });
    }
  }else if(bgOptions.mapSelect=='baidu'){
    if (typeof BMap !== 'undefined') {
      map = new BMap.Map("mapcanvas");
      map.centerAndZoom(new BMap.Point(116.404, 39.915), 12);
      // 添加定位控件
      var geolocationControl = new BMap.GeolocationControl();
      map.addControl(geolocationControl);
      convertor = new BMap.Convertor();
      posIcon = new BMap.Icon("poi.png", new BMap.Size(20,20));
      posIcon.setImageOffset(new BMap.Size(-39,-432));
      curIcon = new BMap.Icon("poi.png", new BMap.Size(20,20));
      curIcon.setImageOffset(new BMap.Size(-39,-409));
    }
  }else if(bgOptions.mapSelect=='google'){
    map = new google.maps.Map(Dom7('#mapcanvas')[0], {
      center: { lat: 39.915, lng: 116.404  },
      zoom: 12,
      disableDefaultUI: true,
    });
  }
  if(mapHasChanges){
    previousLocation=null;
    locationMarkers = []
    stationaryCircles = []
    currentLocationMarker = null
    locationAccuracyCircle = null
    path=null;
    mapHasChanges = false;
  }
}
function toggleTracking(shouldStart) {
  if (shouldStart) {
    startTracking();
  } else {
    stopTracking();
  }
}

function bgConfigure(config) {
  if(config&&bgOptions.mapSelect==config.mapSelect&&mapHasChanges){
    mapHasChanges = false;
  }
  Object.assign(bgOptions, config);
  localStorage.setItem('bgOptions', JSON.stringify(bgOptions));

  var options = Object.assign({}, bgOptions);
  if (options.interval) { options.interval *= 1000; }
  if (options.fastestInterval) { options.fastestInterval *= 1000; }
  if (options.activitiesInterval) { options.activitiesInterval *= 1000; }
  if(mapHasChanges){
    initialMap();
  }
  if (isStarted) {
    stopTracking();
    backgroundGeolocation.configure(
      setCurrentLocation,
      function (err) { console.log('Error occured', err); },
      options
    );
    startTracking();
  } else {
    backgroundGeolocation.configure(
      setCurrentLocation,
      function (err) { console.log('Error occured', err); },
      options
    );
  }
}

function startTracking() {
  if (isStarted) { return; }

  backgroundGeolocation.isLocationEnabled(
    function (enabled) {
      isLocationEnabled = enabled;
      if (enabled) {
        backgroundGeolocation.start(
          null,
          function (error) {
            stopTracking();
            if (error.code === 2) {
              myApp.confirm('Would you like to open app settings?', 'Permission denied', function() {
                backgroundGeolocation.showAppSettings();
              });
            } else {
              myApp.alert(error.message, 'Start failed');
            }
          }
        );
        isStarted = true;
        renderTabBar(isStarted);
      } else {
        myApp.confirm('Would you like to open settings?', 'Location Services are disabled', function() {
          backgroundGeolocation.showLocationSettings();
        });
      }
    },
    function (error) {
      myApp.alert(error, 'Error detecting status of location settings');
    }
  );
}

function stopTracking() {
  if (!isStarted) { return; }
  // userStartIntent = false;

  backgroundGeolocation.stop();
  isStarted = false;
  renderTabBar(isStarted);
}

function renderTabBar(isStarted) {
  $$('#tabbar').html(Template7.templates.tabbarTemplate({isStarted: isStarted}));
}
function translateLocationAmap(location,callbackFn){
  // 原始坐标转换为火星坐标: AMap.convertFrom(lnglat:LngLat|Array.<LngLat>, type:String,function(status:String,result:info/ConvertorResult))
  // 将其他地图服务商的坐标批量转换成高德地图经纬度坐标。最多支持40对坐标。
  // type用于说明是哪个服务商的坐标,可选值有：
  // gps:GPS原始坐标；
  // baidu：百度经纬度；
  // mapbar：图吧经纬度；
  if(location instanceof Array){//数组点
    var latlngs = location.map(function(loc){
      return new AMap.LngLat(Number(loc.longitude),Number(loc.latitude))
    });
    AMap.convertFrom(latlngs,'gps',function(status,data){
      if(data.info=='ok'){
        location = location.map(function(loc,index){
          loc.latitude = data.locations[index].lat;
          loc.longitude = data.locations[index].lng;
          return loc;
        })
        callbackFn(location);
      }
    });
  }else{
    var latlng = new AMap.LngLat(Number(location.longitude),Number(location.latitude));
    AMap.convertFrom(latlng,'gps',function(status,data){
      if(data.info=='ok'){
        location.latitude = data.locations[0].lat;
        location.longitude = data.locations[0].lng;
        callbackFn(location)
      }
    })
  }
}
function setStationaryAmap (location) {
  var latlng = new AMap.LngLat(Number(location.longitude), Number(location.latitude));
  var stationaryCircle = new AMap.Circle({
      fillColor: 'pink',
      fillOpacity: 0.4,
      strokeOpacity: 0,
      map: map,
  });
  stationaryCircle.setCenter(latlng);
  stationaryCircle.setRadius(location.radius);
  stationaryCircles.push(stationaryCircle);
  backgroundGeolocation.finish();
}
function setCurrentLocationAmap (location) {
    if (!currentLocationMarker) {
        currentLocationMarker = new AMap.Marker({
            map: map,
            icon: curIcon,
            offset: new AMap.Pixel(-10,-10)
        });
        locationAccuracyCircle = new AMap.Circle({
            fillColor: 'purple',
            fillOpacity: 0.4,
            strokeOpacity: 0,
            map: map
        });
    }
    if (!path) {
        path = new AMap.Polyline({
            map: map,
            strokeColor: 'blue',
            strokeOpacity: 0.4
        });
    }
    var latlng = new AMap.LngLat(Number(location.longitude), Number(location.latitude));

    if (previousLocation) {
        // Drop a breadcrumb of where we've been.
        locationMarkers.push(new AMap.Marker({
            icon: posIcon,
            map: map,
            position: new AMap.LngLat(previousLocation.longitude, previousLocation.latitude),
            offset: new AMap.Pixel(-10,-10)
        }));
    } else {
        map.setCenter(latlng);
        if (map.getZoom() < 15) {
            map.setZoom(15);
        }
    }

    // Update our current position marker and accuracy bubble.
    currentLocationMarker.setPosition(latlng);
    locationAccuracyCircle.setCenter(latlng);
    var accuracy = location.accuracy>100?100:location.accuracy;
    locationAccuracyCircle.setRadius(accuracy);

    // Add breadcrumb to current Polyline path.
    path.getPath().push(latlng);
    path.setPath(path.getPath());
    previousLocation = location;

    backgroundGeolocation.finish();
}
function translateLocationBd(location,callbackFn){
  if(location instanceof Array){//数组点
    //gps坐标转百度坐标
    var points = location.map(function(loc){
      return new BMap.Point(Number(loc.longitude), Number(loc.latitude));
    })
    convertor.translate(points, 1, 5, function(data){
      if(data.status === 0){
        location = location.map(function(loc,index){
          loc.latitude = data.points[index].lat;
          loc.longitude = data.points[index].lng;
          return loc;
        })
        callbackFn(location);
      }
    })
  }else{
    //gps坐标转百度坐标
    var latlng = new BMap.Point(Number(location.longitude), Number(location.latitude));
    convertor.translate([latlng], 1, 5, function(data){
      if(data.status === 0){
        location.latitude = data.points[0].lat;
        location.longitude = data.points[0].lng;
        callbackFn(location);
      }
    })
  }
  
  //gps坐标转高德、google国内坐标
  //$$.get(url, data, success, error);
  //http://restapi.amap.com/v3/assistant/coordinate/convert?locations=116.481499,39.990475&coordsys=gps&key=8df217fa3e0699740cd6062ac53d588a
}
function setStationaryBd (location) {
  var latlng = new BMap.Point(Number(location.longitude), Number(location.latitude));
  var radius = location.radius>100?100:location.radius
  var stationaryCircle = new BMap.Circle(latlng,radius,{
      strokeColor: 'pink',
      strokeWeight: 2,
      strokeOpacity: 0.2
  });
  map.addOverlay(stationaryCircle);
  map.setCenter(latlng);
  backgroundGeolocation.finish();
}
function setCurrentLocationBd (location) {
  var latlng = new BMap.Point(Number(location.longitude), Number(location.latitude));
  currentLocationMarker = new BMap.Marker(latlng,{icon:posIcon});
  var accuracy = location.accuracy>100?100:location.accuracy;
  locationAccuracyCircle = new BMap.Circle(latlng,accuracy,{
      strokeColor: 'purple',
      strokeWeight: 2,
      strokeOpacity: 0.2
  });
  // Update our current position marker and accuracy bubble.
  map.addOverlay(currentLocationMarker);
  map.addOverlay(locationAccuracyCircle);

  if (previousLocation) {
      // Drop a breadcrumb of where we've been.
      var points = [];
      points.push(new BMap.Point(Number(previousLocation.longitude), Number(previousLocation.latitude)));
      points.push(latlng);
      path = new BMap.Polyline(points,{
          strokeColor: 'blue', strokeWeight:2, strokeOpacity:0.5
      });
      map.addOverlay(path);
  }
  map.setCenter(latlng);
  if (map.getZoom() < 15) {
      map.setZoom(15);
  }
  previousLocation = location;

  backgroundGeolocation.finish();   
}
function translateLocationGoogle(location,callbackFn){
  //原始坐标转换为火星坐标
  var url = "http://restapi.amap.com/v3/assistant/coordinate/convert";
  if(location instanceof Array){//数组点
    var data = {
      locations:location.map(function(ele){return ele.longitude+','+ele.latitude}).join(';'),
      coordsys:"gps",
      key:"8df217fa3e0699740cd6062ac53d588a"
    }
    $$.get(url,data, function(data){
      data = JSON.parse(data);
      if(data.info=="ok"){
        data.locations = data.locations.split(";");
        location = location.map(function(loc,index){
          var latlng = data.locations[index].split(",");
          loc.longitude = latlng[0];
          loc.latitude = latlng[1];
          return loc;
        })
        callbackFn(location);
      }
    }, function(err){
      console.log(err);
      callbackFn(location);
    })
  }else{
    var data = {
      locations:location.longitude+","+location.latitude,
      coordsys:"gps",
      key:"8df217fa3e0699740cd6062ac53d588a"
    }
    $$.get(url,data, function(data){
      data = JSON.parse(data);
      if(data.info=="ok"){
        var latlng = data.locations.split(",");
        location.longitude = latlng[0];
        location.latitude = latlng[1];
        callbackFn(location);
      }
    }, function(err){
      console.log(err);
      callbackFn(location);
    })
  }
}
function setStationaryGoogle (location) {
  var latlng = new google.maps.LatLng(Number(location.latitude), Number(location.longitude));
  var stationaryCircle = new google.maps.Circle({
      fillColor: 'pink',
      fillOpacity: 0.4,
      strokeOpacity: 0,
      map: map,
  });
  stationaryCircle.setCenter(latlng);
  stationaryCircle.setRadius(location.radius);
  stationaryCircles.push(stationaryCircle);
  backgroundGeolocation.finish();
}
function setCurrentLocationGoogle (location) {
    if (!currentLocationMarker) {
        currentLocationMarker = new google.maps.Marker({
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: 'gold',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 3
            }
        });
        locationAccuracyCircle = new google.maps.Circle({
            fillColor: 'purple',
            fillOpacity: 0.4,
            strokeOpacity: 0,
            map: map
        });
    }
    if (!path) {
        path = new google.maps.Polyline({
            map: map,
            strokeColor: 'blue',
            fillOpacity: 0.4
        });
    }
    var latlng = new google.maps.LatLng(Number(location.latitude), Number(location.longitude));

    if (previousLocation) {
        // Drop a breadcrumb of where we've been.
        locationMarkers.push(new google.maps.Marker({
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: 'green',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 3
            },
            map: map,
            position: new google.maps.LatLng(previousLocation.latitude, previousLocation.longitude)
        }));
    } else {
        map.setCenter(latlng);
        if (map.getZoom() < 15) {
            map.setZoom(15);
        }
    }

    // Update our current position marker and accuracy bubble.
    currentLocationMarker.setPosition(latlng);
    locationAccuracyCircle.setCenter(latlng);
    var accuracy = location.accuracy>100?100:location.accuracy;
    locationAccuracyCircle.setRadius(accuracy);

    // Add breadcrumb to current Polyline path.
    path.getPath().push(latlng);
    previousLocation = location;

    backgroundGeolocation.finish();
}
function setStationary (location) {
  console.log('[DEBUG] stationary recieved', location);
  if(bgOptions.mapSelect=='amap'){
    translateLocationAmap(location,setStationaryAmap);
  }else if(bgOptions.mapSelect=='baidu'){
    translateLocationBd(location,setStationaryBd);
  }else if(bgOptions.mapSelect=='google'){
    translateLocationGoogle(location,setStationaryGoogle);
  }
}

function setCurrentLocation (location) {
  console.log('[DEBUG] location recieved', location);
  if(bgOptions.mapSelect=='amap'){
    translateLocationAmap(location,setCurrentLocationAmap);
  }else if(bgOptions.mapSelect=='baidu'){
    translateLocationBd(location,setCurrentLocationBd);
  }else if(bgOptions.mapSelect=='google'){
    translateLocationGoogle(location,setCurrentLocationGoogle);
  }
}

function onDeviceReady() {
  backgroundGeolocation = window.backgroundGeolocation || window.backgroundGeoLocation || window.universalGeolocation;
  backgroundGeolocation.getLocations(function(locs) {
    var now = Date.now();
    var sameDayDiffInMillis = 24 * 3600 * 1000;
    locs = locs.filter(function(loc){return (now - loc.time) <= sameDayDiffInMillis});
    if(locs.length){
      //添加坐标转换
      if(bgOptions.mapSelect=='amap'){
        translateLocationAmap(locs,function(locs){
          locs.forEach(function(loc){
            setCurrentLocationAmap(loc);
          })
        })
      }else if(bgOptions.mapSelect=='baidu'){
        translateLocationBd(locs,function(locs){
          locs.forEach(function(loc){
            setCurrentLocationBd(loc);
          })
        })
      }else if(bgOptions.mapSelect=='google'){
        translateLocationGoogle(locs,function(locs){
          locs.forEach(function(loc){
            setCurrentLocationGoogle(loc);
          })
        })
      }
    }
  });
  myApp.init();
}

document.addEventListener('deviceready', onDeviceReady, false);
//test code
if(!window.cordova){
  var backgroundGeolocation ={
    getLocations:function(sucess){
      sucess([]);
      // var dateNow = new Date().getTime();
      // setTimeout(()=>{
      //   sucess([{
      //     latitude:22.738723,
      //     longitude:114.463542,
      //     time:dateNow,
      //     accuracy:40
      //   },{
      //     latitude:22.735859,
      //     longitude:114.470343,
      //     time:dateNow,
      //     accuracy:240
      //   },{
      //     latitude:22.733919,
      //     longitude:114.471995,
      //     time:dateNow,
      //     accuracy:80
      //   }])
      // })
    },
    configure:function(sucess,failure,options){
      sucess({
        latitude:22.738723,
        longitude:114.463542,
        accuracy:40
      })
      setTimeout(()=>{
                sucess({
        latitude:22.735859,
        longitude:114.470343,
        accuracy:240
      })
            },8000);
      setTimeout(()=>{
                sucess({
        latitude:22.733919,
        longitude:114.471995,
        accuracy:80
      })
            },13000);
    },
    finish:function(){},
    onStationary:function(sucess){
      sucess({
        latitude:22.738723,
        longitude:114.463542,
        radius:240
      });
    },
    watchLocationMode:function(sucess,failure){
      sucess();
    },
    isLocationEnabled:function(sucess,failure){
      sucess(true);
    },
    start:function(sucess,failure){

    },
    stop:function(sucess,failure){
      
    }
  }
  onDeviceReady();
}
