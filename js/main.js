//wrap everything in a self-executing anonymous function to move to local scope
(function(){

//pseudo-global variables
var attrArray = ["Sample Size", "Percent Birth", "Percent Pregnant", "Twin Rate", "Avg Selenium (ppb)", "Franzman (Fall)", "Franzman (Spring)", "Percent Calf Survival", "Max Fat (Fall)", "Max Fat (Spring)"];
console.log(attrArray)
var expressed = attrArray[0]; //initial attribute

//chart frame dimensions
var chartWidth = window.innerWidth * 0.425,
    chartHeight = 473,
    leftPadding = 25,
    rightPadding = 2,
    topBottomPadding = 5,
    chartInnerWidth = chartWidth - leftPadding - rightPadding,
    chartInnerHeight = chartHeight - topBottomPadding * 2,
    translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

//create a scale to size bars proportionally to frame and for axis
var yScale = d3.scaleLinear()
    .range([chartHeight-10, 0])
    .domain([0, 110]);
    
//begin script when window loads
window.onload = setMap();

function setMap(){

    //map frame dimensions
    var width = window.innerWidth * 0.5
    var height = 460;
   
    //create new svg container for the map
    var map = d3.select("body")
        .append("svg")
        .attr("class", "map")
        .attr("width", width)
        .attr("height", height);

    //create Albers equal area conic projection centered on Alaska    
    var projection = d3.geoAlbers()
        .center([-6.17, 60])
        .rotate([144.51, 0, 0])
        .parallels([29.5, 45.5])
        .scale(13000)
        .translate([width / 2, height / 2]);

    var path = d3.geoPath()
        .projection(projection);

    //use d3.queue to parallelize asynchronous data loading
    d3.queue()
        .defer(d3.csv, "data/ucu_summer.csv") //load attributes from csv
        .defer(d3.json, "data/subunits_clip.topojson")
        .defer(d3.json, "data/lakes.topojson")
        .defer(d3.json, "data/ucu_wgs84.topojson")
        .await(callback);
        
    function callback(error, csvData, subunit, lake, ucu){
               
        //translate topojson
        var gmu = topojson.feature(subunit, subunit.objects.subunits_clip),
            
        lakeRegions = topojson.feature(lake, lake.objects.lakes),
            
        ucuRegions = topojson.feature(ucu, ucu.objects.ucu_wgs84).features;
        
        //place graticule on the map
        setGraticule(map, path);
        
        //add alaska to map
        var alaska = map.append("path")
            .datum(gmu)
            .attr("class", "alaska")
            .attr("d", path);
        
        //join csv data to GeoJSON enumeration units
        ucuRegions = joinData(ucuRegions, csvData);
        
        //create the color scale
        var colorScale = makeColorScale(csvData);
        
        //add enumeration units to the map
        setEnumerationUnits(ucuRegions, map, path, colorScale);
        
        //add coordinated visualization to the map
        setChart(csvData, colorScale);
        
        //add lakes to map
        var water = map.append("path")
            .datum(lakeRegions)
            .attr("class", "water")
            .attr("d", path);
       
        //add dropdown to the map
        createDropdown(csvData);
       
    }; //end of callback
}; //end of setMap()
    
//----------------------------------------------------------------
    
//function to create coordinated bar chart
function setChart(csvData, colorScale){
    
    //create a second svg element to hold the bar chart
    var chart = d3.select("body")
        .append("svg")
        .attr("width", chartWidth)
        .attr("height", chartHeight)
        .attr("class", "chart");
    
    //create a rectangle for chart background fill
    var chartBackground = chart.append("rect")
        .attr("class", "chartBackground")
        .attr("width", chartInnerWidth)
        .attr("height", chartInnerHeight)
        .attr("transform", translate);
    
    //set bars for each province
    var bars = chart.selectAll(".bar")
        .data(csvData)
        .enter()
        .append("rect")
        .sort(function(a, b){
            return b[expressed]-a[expressed]
        })
        .attr("class", function(d){
            return "bar " + d.ucuWinter;
        })
        .attr("width", chartInnerWidth / csvData.length - 1)
        .on("mouseover", highlight)
        .on("mouseout", dehighlight)
        .on("mousemove", moveLabel);

    var desc = bars.append("desc")
        .text('{"stroke": "none", "stroke-width": "0px"}');
    
    //create a text element for the chart title
    var chartTitle = chart.append("text")
        .attr("x", 40)
        .attr("y", 40)
        .attr("class", "chartTitle")
        .text(expressed);
    
    //create vertical axis generator
    var yAxis = d3.axisLeft()
        .scale(yScale);

    //place axis
    var axis = chart.append("g")
        .attr("class", "axis")
        .attr("transform", translate)
        .call(yAxis);
    
    //create frame for chart border
    var chartFrame = chart.append("rect")
        .attr("class", "chartFrame")
        .attr("width", chartInnerWidth)
        .attr("height", chartInnerHeight)
        .attr("transform", translate)
    
    //set bar positions, heights, and colors
    updateChart(bars, csvData.length, colorScale);
};
    
//----------------------------------------------------------------
    
function joinData(ucuRegions, csvData){
    //loop through csv to assign each set of csv attribute values to geojson region
    for (var i=0; i<csvData.length; i++){
        var csvRegion = csvData[i]; //the current region
        var csvKey = csvRegion.ucuWinter; //the CSV primary key

        //loop through geojson regions to find correct region
        for (var a=0; a<ucuRegions.length; a++){

            var geojsonProps = ucuRegions[a].properties; //the current region geojson properties
            var geojsonKey = geojsonProps.ucuWinter; //the geojson primary key

            //where primary keys match, transfer csv data to geojson properties object
            if (geojsonKey == csvKey){

                //assign all attributes and values
                attrArray.forEach(function(attr){
                    var val = parseFloat(csvRegion[attr]); //get csv attribute value
                    geojsonProps[attr] = val; //assign attribute and value to geojson properties
                });
            };
        };
    };
    return ucuRegions;
};

//----------------------------------------------------------------

//function to create color scale generator
function makeColorScale(data){
    var colorClasses = [
        "#fec39b",
        "#fba66f",
        "#fb7128",
        "#e16324",
        "#a74719"
    ];
    
    //create color scale generator
    var colorScale = d3.scaleThreshold()
        .range(colorClasses);

    //build array of all values of the expressed attribute
    var domainArray = [];
    for (var i=0; i<data.length; i++){
        var val = parseFloat(data[i][expressed]);
        domainArray.push(val);
    };

    //cluster data using ckmeans clustering algorithm to create natural breaks
    var clusters = ss.ckmeans(domainArray, 5);
    //reset domain array to cluster minimums
    domainArray = clusters.map(function(d){
        return d3.min(d);
    });
    //remove first value from domain array to create class breakpoints
    domainArray.shift();

    //assign array of last 4 cluster minimums as domain
    colorScale.domain(domainArray);

    return colorScale;
};

//---------------------------------------------------------------- 

function setEnumerationUnits(ucuRegions, map, path, colorScale){
        //add ucu regions to map
        var regions = map.selectAll(".regions")
            .data(ucuRegions)
            .enter()
            .append("path")
            .attr("class", function(d){
                return "regions " + d.properties.ucuWinter;
            })
            .attr("d", path)
            .style("fill", function(d){
            return choropleth(d.properties, colorScale);
        })
            .on("mouseover", function(d){
            highlight(d.properties);
        })
            .on("mouseout", function(d){
            dehighlight(d.properties);
        })
            .on("mousemove", moveLabel);

        var desc = regions.append("desc")
        .text('{"stroke": "#000", "stroke-width": "0.5px"}');
        };
 
//----------------------------------------------------------------    

//function to test for data value and return color
function choropleth(props, colorScale){
    //make sure attribute value is a number
    var val = parseFloat(props[expressed]);
    //if attribute value exists, assign a color; otherwise assign gray
    if (typeof val == 'number' && !isNaN(val)){
        return colorScale(val);
    } else {
        return "#CCC";
    };
};

//---------------------------------------------------------------- 
function setGraticule(map, path){
        var graticule = d3.geoGraticule()
            .step([5, 5]); //place graticule lines every 5 degrees of longitude and latitude

        //create graticule background
        var gratBackground = map.append("path")
            .datum(graticule.outline()) //bind graticule background
            .attr("class", "gratBackground") //assign class for styling
            .attr("d", path) //project graticule

        //Example 2.6 line 5...create graticule lines
        var gratLines = map.selectAll(".gratLines") //select graticule elements that will be created
};
//----------------------------------------------------------------
    
//function to create a dropdown menu for attribute selection
function createDropdown(csvData){
    //add select element
    var dropdown = d3.select("body")
        .append("select")
        .attr("class", "dropdown")
        .on("change", function(){
            changeAttribute(this.value, csvData)
        });

    //add initial option
    var titleOption = dropdown.append("option")
        .attr("class", "titleOption")
        .attr("disabled", "true")
        .text("Select Attribute");

    //add attribute name options
    var attrOptions = dropdown.selectAll("attrOptions")
        .data(attrArray)
        .enter()
        .append("option")
        .attr("value", function(d){ return d })
        .text(function(d){ return d });
};
//--------------------------------------------------------------- 
    
//dropdown change listener handler
function changeAttribute(attribute, csvData){
    //change the expressed attribute
    expressed = attribute;
    
    //change yscale dynamically
    var csvmax = d3.max(csvData, function(d) {return parseFloat(d[expressed])});
    
    console.log(csvmax);
    
    yScale = d3.scaleLinear()
        .range([chartHeight - 10, 0])
        .domain([0, (csvmax*1.1)])
        .nice();
    
    //update vertical axis
    d3.select(".axis").remove();
    var yAxis = d3.axisLeft()
        .scale(yScale);
    
    //place axis
    var axis = d3.select(".chart")
        .append("g")
        .attr("class", "axis")
        .attr("transform", translate)
        .call(yAxis);    
    
    //recreate the color scale
    var colorScale = makeColorScale(csvData);

    //recolor enumeration units
    var regions = d3.selectAll(".regions")
        .transition()
        .duration(1000)
        .style("fill", function(d){
            return choropleth(d.properties, colorScale)
        });

    //re-sort, resize, and recolor bars
    var bars = d3.selectAll(".bar")
        //re-sort bars
        .sort(function(a, b){
            return b[expressed] - a[expressed];
        })
        .transition() //add animation
        .delay(function(d, i){
            return i * 20
        })
        .duration(500);
        
    updateChart(bars, csvData.length, colorScale);
};

//----------------------------------------------------------------
    
//function to position, size, and color bars in chart
function updateChart(bars, n, colorScale){
    //position bars
    bars.attr("x", function(d, i){
            return i * (chartInnerWidth / n) + leftPadding;
        })
        //size/resize bars
        .attr("height", function(d, i){
            return (chartHeight-10) - yScale(parseFloat(d[expressed]));
        })
        .attr("y", function(d, i){
            return yScale(parseFloat(d[expressed])) + topBottomPadding;
        })
        //color/recolor bars
        .style("fill", function(d){
            return choropleth(d, colorScale);
        });
    
    var chartTitle = d3.select(".chartTitle")
        .text(expressed);
};
    
//----------------------------------------------------------------

//function to highlight enumeration units and bars
function highlight(props){
    //change stroke
    console.log(props.ucuWinter)
    var selected = d3.selectAll("." + props.ucuWinter)
        .style("stroke", "#264653")
        .style("stroke-width", "3");
    
    setLabel(props)
};
    
//----------------------------------------------------------------

//function to reset the element style on mouseout
function dehighlight(props){
    var selected = d3.selectAll("." + props.ucuWinter)
        .style("stroke", function(){
            return getStyle(this, "stroke")
        })
        .style("stroke-width", function(){
            return getStyle(this, "stroke-width")
        });

    function getStyle(element, styleName){
        var styleText = d3.select(element)
            .select("desc")
            .text();

        var styleObject = JSON.parse(styleText);

        return styleObject[styleName];
    };
    //remove info label
    d3.select(".infolabel")
        .remove();
};
    
//----------------------------------------------------------------
    
//function to create dynamic label
function setLabel(props){
    //label content
    var labelAttribute = "<h1>" + props[expressed] +
        "</h1><b>" + expressed + "</b>";

    //create info label div
    var infolabel = d3.select("body")
        .append("div")
        .attr("class", "infolabel")
        .attr("id", props.ucuWinter + "_label")
        .html(labelAttribute);

    var regionName = infolabel.append("div")
        .attr("class", "labelname")
        .html("Unit: 15" + props.ucuWinter);
};
  
//----------------------------------------------------------------
    
//function to move info label with mouse
function moveLabel(){
     //get width of label
    var labelWidth = d3.select(".infolabel")
        .node()
        .getBoundingClientRect()
        .width;

    //use coordinates of mousemove event to set label coordinates
    var x1 = d3.event.clientX + 10,
        y1 = d3.event.clientY - 75,
        x2 = d3.event.clientX - labelWidth - 10,
        y2 = d3.event.clientY + 25;

    //horizontal label coordinate, testing for overflow
    var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1; 
    //vertical label coordinate, testing for overflow
    var y = d3.event.clientY < 75 ? y2 : y1; 

    d3.select(".infolabel")
        .style("left", x + "px")
        .style("top", y + "px");
};
    
//----------------------------------------------------------------
})(); //last line of main.js