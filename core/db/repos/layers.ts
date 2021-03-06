import { IDatabase, IMain } from 'pg-promise';
import sqlProvider = require('../sql');
import { exec } from 'child_process'

const spawn = require('bluebird').promisify(exec);

var sql = sqlProvider.layers;

/*
 This repository mixes hard-coded and dynamic SQL,
 primarily to show a diverse example of using both.
 */

export class Repository {

    constructor(db:any, pgp: IMain) {
        this.db = db;
        this.pgp = pgp; // library's root, if ever needed;
    }

    // if you need to access other repositories from here,
    // you will have to replace 'IDatabase<any>' with 'any':
    private db:IDatabase<any>;

    private pgp:IMain;

        getFeaturesIntersecting(wkt : string, ...layers : string[]) {
            return this.db.task( t=>
                t.batch(
                    layers.map( layerName => 
                        this.getLayerSchema(layerName)
                        .then( (schema : any) =>{
                            // Obtenemos todas las columnas de la Tabla (schema)
                            let geomColumn = schema.find( (col : any)=> col.type === 'USER-DEFINED' && col.udt === 'geometry' ).name;
                            // Obtenemos la columna de Geometría (para ello nos fijamos en el udt_name)
                            let properties = schema
                                .filter( (col : any) => col.name !== geomColumn )
                                .map( (col : any) => col.name).join();
                            return this.db.manyOrNone(
                                sql.getFeaturesIntersecting
                                , { wkt, geomColumn, properties, layerName }
                            ) 
                        })
                    )
                ).then( (founds : any) => founds.map( (el : any) => el[0] ))
            )
        }

        exist(tableName : string){
            return this.db.one("SELECT EXISTS( SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName#}' )", { tableName })
            .then( (result : any) => result.exists );
        }

        importSHP( shpPath : string, tableName : string ){
            //require('fs').readFile(`${shpPath}`, (err, file)=>console.log(err, file, 'guaa'));
            console.log(`export PGPASSWORD=postgres && shp2pgsql -I -W "LATIN1" ${shpPath} "capas"."${tableName}" | psql -d betera-test -U postgres`);
            return spawn(`export PGPASSWORD=postgres && shp2pgsql -I -s 25830 -W "LATIN1" ${shpPath} "capas"."${tableName}" | psql -d betera-test -U postgres`, { shell : true})
        }

        createTable(){
            return this.db.none(sql.create);
        }        
        // GET TILE
        /*getTile(layer, bbox){
            this.db.one();
        }*/

        // Devuelvo el tipo de Geometría
        getLayerGeometryType( layerName : string, geomColumn : string ){
            return this.db.one(sql.getLayerGeometryType, {
                table : this.pgp.as.value(layerName),
                geomColumn : this.pgp.as.value(geomColumn)
            }, geometry => geometry.type);
        }

        // Buscar por (id o name)
        findBy( column : string, value : (string | number) ){
            return this.db.oneOrNone(sql.findBy, {
                column: this.pgp.as.name(column),
                value: this.pgp.as.value(value)
            });
        }

        // Devuelve el ID y el nombre de una capa
        getLayerNames(...ids : (string | number)[]){
            return this.db.manyOrNone(sql.getLayerNames, {
                ids
            });            
        }


        // Obtener las columnas y el tipo de dato de una tabla
        getLayerSchema( tableName : string ){
            return this.db.many(sql.schema, {
                tableName : this.pgp.as.value(tableName)
            });
        }

        getAllLayers(){
            return this.db.manyOrNone(sql.getAllLayers);
        }

        getAllBaseLayers(){
            return this.db.manyOrNone(sql.getAllBaseLayers);     
        }

        getBaseLayer( id_layer : (string | number) ){
            return this.db.one(sql.getBaseLayer, {
                id_layer : this.pgp.as.value(id_layer)
            });
        }

        // Obtener una capa como GeoJSON
        getLayerAsGeoJSON(layerName : string){
            return this.getLayerSchema(layerName)
            .then( ( schema : any ) =>{
                // Obtenemos todas las columnas de la Tabla (schema)
                let geomColumn = schema.find( ( col : any )=> col.type === 'USER-DEFINED' && col.udt === 'geometry' ).name;
                // Obtenemos la columna de Geometría (para ello nos fijamos en el udt_name)
                let properties = schema.filter( ( col : any ) => col.name !== geomColumn );
                //console.log('geomColum :', geomColumn, 'properties :', properties)
                return this.db.one(sql.getLayerAsGeoJSON, {
                    geomColumn : this.pgp.as.name(geomColumn),
                    properties : properties.map( ( prop : any ) => this.pgp.as.name(prop.name)).join(),
                    layerName
                })
                // Devolvemos un objeto 
                // {layerName : 'Nombre de la capa', layer : 'Capa en formato GeoJSON'}
                .then( ( layer : any ) =>{
                    return this.getLayerGeometryType(layerName, geomColumn)
                    .then( ( geomColumnType : any ) => ({ layerName, geomColumnType, layer : layer.result }))
                })
            })
        }

}
