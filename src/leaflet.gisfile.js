/*
 (c) 2015-2016, Sergey Shelkovnikov
 https://github.com/gisfile/leaflet.gisfile.js
 L.GISFileAPI turns GISFile API box (http://gisfile.com/api/1.0/doc/jsonp/) data into a Leaflet layer.
*/

L.GISFileAPI = L.Class.extend({
    includes: L.Mixin.Events
    , timer: null
    , mouseMoveTimer: null
    , counter: 0
    , process: []
    , options: {
        url:'http://gisfile.com/layer/'
        , layer: ''  // Layer Name
        , field: ''  // Layer Field (example: uid)
        , name: ''   // Array Field (example: Id)
        , ids: []    // [{Id:728},{Id:20}]
        , filter: '' // "{uid:[728,20]}"
        , count: 100
        , format: 'jsonc' // caching = true - jsonc, false - jsonp
        , caching: true
        , inbox: false
        , popup: true
        , minZoom: 01
        , maxZoom: 18
        //, opacity: 1
        , attribution: '<a href="http://gisfile.com" target="_blank">GISFile.com</a>'
    }

    , initialize: function (options) {
        var that = this;
        L.setOptions(that, options);
        that._hash = {};
        that._layer = L.geoJson();
        that._mouseIsDown = false;
        that._popupIsOpen = false;
        that.setStyle(that);
    }

    , setOptions: function (newOptions) {
        var that = this;
        L.setOptions(that, newOptions);
        that.setStyle(that);
        that._update();
    }
    
    , setStyle: function (that) {
        if (that.options.style)
            that.style = that.options.style;
        
        if (that.options.onEachFeature) 
            that.onEachFeature = that.options.onEachFeature;
        
        if (that.options.caching)
            that.options.format = 'jsonc'
        else
            that.options.format = 'jsonp';
    }

    , onAdd: function (map) {
        var that = this;
        that._map = map;
        map.on('viewreset', that._update, that);
        map.on('moveend', that._update, that);
        map.on('zoomend', that._update, that);
        that._update();
    }

    , onRemove: function (map) {
        var that = this;

        map.off('viewreset', that._update, that);
        map.off('moveend', that._update, that);
        map.off('zoomend', that._update, that);
    }

    , addTo: function (map) {
        map.addLayer(this);
        return this;
    }
    
    , _update: function () {
        var that = this;

        if (that.timer) {
            window.clearTimeout(that.timer);
            that.process = [];
            
            if (that._map._zoom < that.options.minZoom) { 
                that._map.removeLayer(that._layer);
            }
        } else {
            that.process = [];
            that._layer = L.layerGroup();
            that._layer.addTo( that._map);
        }
        
        if (that._map._zoom >= that.options.minZoom) 
        {
            if (!that._map.hasLayer(that._layer)) {
                that._layer = L.layerGroup();
                that._layer.addTo( that._map);
            }
            
            that.timer = window.setTimeout(function() 
            { 
                var p = new Date().getTime();
                that.process[p] = true;
                var i = "";
                var draw = that._layer && that._layer._layers && Object.keys( that._layer._layers).length == 0;

                for (var v in that.options.ids) 
                {
                    var id = that.options.ids[ v][ that.options.name];
                    var xy = parseLatLng( that.options.ids[ v].GeoPoint);
                    
                    //if (that._map.getBounds().contains( xy)) 
                    {
                        if (that._hash[id] == undefined && that._map.getBounds().contains( xy)) {
                            i = i +(i.length > 0 ? "," : "") +id;
                        } else if ( draw == true) {
                            var items = that._hash[id];

                            for (var m in items) {
                                var item = items[m];
                                var l = L.geoJson( item, { style: that.style, onEachFeature: that.onEachFeature });
                                l.addTo( that._layer);
                            }
                        }
                    }
                }
                
                if (i.length > 0) {
                    that.options.filter = "{" +that.options.field +":[" +i +"]}";
                    that._jsonp( that, 0, p); 
                } 
                else if (that.options.ids.length == 0 && jQuery.isEmptyObject(that._hash)) {
                    that._jsonp( that, 0, p); 
                }                
            },0);
        }
    }
    
    , _jsonp: function ( that, offset, p) {
        that.counter++;
        var jdata = {};
        
        if (that.options.inbox == true) {
            jdata = {
                'function' : 'box'
                , 'box' : that._map.getBounds().toBBoxString()
                , 'filter' : that.options.filter
                , 'format' : that.options.format
                , 'count' : '100'
                , 'offset' : offset
                //, 'pack' : 'gzip'
            }
        } else {
            jdata = {
                'function' : 'load'
                , 'filter' : that.options.filter
                , 'format' : that.options.format
                , 'count' : '100'
                , 'offset' : offset
                //, 'pack' : 'gzip'
            }
        }
        
        $.ajax({
            url : that.options.url +that.options.layer +'/' +that.options.format
            , dataType : 'jsonp' //that.options.format
            , data : jdata
            , success: function(response) {
                that.counter--;
                if (response && response.data && that.process[p]) 
                {
                    var data = response.data
                    var end = response.end;
                    var next = response.next;
                    
                    for (var i=0;i<data.length;i++) 
                    {
                        var item = data[i];
                        var l;
                        
                        if (that.options.popup)
                            l = L.geoJson( item, { style: that.style, onEachFeature: that.onEachFeature });
                        else
                            l = L.geoJson( item, { style: that.style });
                        
                        var id = parseInt( item.properties.uid);
                        
                        if (that._hash[id] == undefined) that._hash[id] = [];                        
                        that._hash[id].push( item);
                        l.addTo( that._layer);
                    }

                    if (!end) {
                        that._jsonp( that, next, p);
                    }                        
                }
            } 
            , error: function(xhr, status, error) {
                //console.log( xhr, status, error.Message);
            }
        })
    }

    , onEachFeature: function(feature, layer) 
    {
        if (feature.properties) {
            var items = [];
            $.each( feature.properties, function( key, val ) {  
                items.push( "<h4>" +key +"</h4>" + val + "<br>" );
            });  

            var popupContent = "<div class='modal-body' style='width: 287px'>" +
                               "<p>" +items.join( "") +"</p>" +
                               "</div>";

            if (feature.properties && feature.properties.popupContent) {
                layer.bindPopup(feature.properties.popupContent);
            }

            layer.bindPopup(popupContent);
        }
    }
 
    , style: function(feature) {
        if (feature.styles) {
            if (feature.styles.fill == "false")
                feature.styles.fillColor = 'none';
            if (feature.styles.stroke == "false")
                feature.styles.color = 'none';
            return feature.styles;
        } else
            return {
                fillColor: '#DB4436',
                weight: 1,
                opacity: 1,
                color: '#DB4436',
                fillOpacity: 0.3
            }
    }
})
