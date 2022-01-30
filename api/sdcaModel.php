<?php

# SDCA model
class sdcaModel
{
	# Class properties
	private $tablePrefix = false;


	# Constructor
	public function __construct ($databaseConnection, $settings, $bbox, $zoom, $get)
	{
		# Property handles
		$this->databaseConnection = $databaseConnection;
		$this->settings = $settings;
		
		# Set values provided by the API
		$this->bbox = $bbox;	// Validated
		$this->zoom = $zoom;	// Validated
		$this->get = $get;		// Unvalidated contents of $_GET, i.e. query string values

	}


	# Beta mode
	public function enableBetaMode ()
	{
		$this->tablePrefix = 'alt_';
	}


	/*
	# Example model
	public function exampleModel (&$error = false)
	{
		// Logic assembles the values returned below
		// ...

		# Return the model
		return array (
			'table' => 'table',
			'fields' => $fields,			// Fields to retrieve
			'constraints' => $constraints,	// Database constraints
			'parameters' => $parameters,	// Parameters, e.g. :w for bbox west
			'limit' => $limit,				// Limit of data returned
		);
	}
	*/


	# Data for locations test
	public function locationsModel (&$error = false)
	{
		# Get the line
		if (!isSet ($_GET['line']) || !strlen ($_GET['line'])) {
			$error = 'No line supplied';
			return false;
		}
		
		# Base values
		$fields = array (
			'lsoa11',
			//'ST_AsGeoJSON(geometry, 5) AS geometry',
		);
		$constraints = array (
			'ST_Intersects(ST_GeomFromGeoJSON(:line), geometry)'
		);
		$parameters = array (
			'line' => '{"type": "LineString", "coordinates": ' . $_GET['line'] . '}',
		);
		$limit = false;
		
		# Return the model
		return array (
			'table' => $this->tablePrefix . 'carbon',
			'fields' => $fields,
			'constraints' => $constraints,
			'parameters' => $parameters,
			'limit' => $limit,
			'format' => 'flatjson',
		);
	}
	
	
	# Processing function for locations model
	#!# Currently just an example
	public function locationsModelProcessing ($data)
	{
		# Example - Get each LSOA
		$lsoas = array ();
		foreach ($data as $row) {
			$lsoas[] = $row['lsoa11'];
		}
		$parameter = implode (',', $lsoas);
		
		#!# For now, mock with the sample data, pending implementation of the lookups
		$parameter = file_get_contents ($_SERVER['DOCUMENT_ROOT'] . '/lexicon/example_r_input.json');
		$parameter = str_replace ('D:/GitHub/SDCA-tool/sdca-data-prep/data/UKdem.tif', '/var/www/sdca/data/dem/UKdem.tif', $parameter);
		$parameter = str_replace ('D:/GitHub/SDCA-tool/sdca-data-prep/data/landcover.tif', '/var/www/sdca/data/landcover/landcover.tif', $parameter);
		$mockDataJson = json_decode ($parameter, true);
		
		# Mock the user input, which is a feature collection
		$input = array (
			'type' => 'FeatureCollection',
			'features' => array (
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Viaduct',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": [[-2.608609199523926,51.43295580384589],[-2.612900733947754,51.43164480415281],[-2.615647315979004,51.43151102655865],[-2.6187801361083986,51.432046134585],[-2.6204967498779299,51.43311633183522],[-2.622213363647461,51.43485534889799],[-2.622556686401367,51.436728062471079],[-2.6235437393188478,51.438520444982177],[-2.625002861022949,51.440633760869967],[-2.6259899139404299,51.44269348098991],[-2.6259899139404299,51.445929996356657],[-2.6259469985961916,51.44814995277301],[-2.6265048980712888,51.45066398994956],[-2.6279211044311525,51.452536055368657],[-2.62847900390625,51.45416736406834],[-2.6287364959716799,51.4548091744627],[-2.6301097869873049,51.45593232093998],[-2.631611824035644,51.45726936404845],[-2.6322126388549806,51.458499409118719],[-2.631826400756836,51.4602374597704],[-2.6318693161010739,51.46176154202789],[-2.6328134536743166,51.463285573389857],[-2.6336288452148439,51.46499670584397],[-2.634057998657226,51.46644042394473],[-2.635946273803711,51.467696956223367],[-2.640194892883301,51.46865938307697],[-2.64495849609375,51.469889121180688],[-2.6468896865844728,51.470824769273338],[-2.64920711517334,51.47213464436686],[-2.651181221008301,51.47315043997589],[-2.65169620513916,51.47427313512371],[-2.6520395278930666,51.476117502883678],[-2.6526403427124025,51.47769451182406],[-2.654571533203125,51.47943183143322],[-2.657747268676758,51.48042073765504],[-2.660536766052246,51.48058109880567],[-2.664656639099121,51.48012674074777],[-2.6672744750976564,51.47854981590163],[-2.669506072998047,51.47702629435359],[-2.6735830307006838,51.476705546490567],[-2.6780033111572267,51.477347039961127],[-2.6808357238769529,51.47785488256033],[-2.683582305908203,51.47905764510902],[-2.685084342956543,51.48039401074178],[-2.6877880096435549,51.48189069376375],[-2.689633369445801,51.482906272126928],[-2.692723274230957,51.48341405282735],[-2.6952552795410158,51.483654578554119],[-2.7020359039306638,51.482692468035228],[-2.707657814025879,51.48183724164446],[-2.712893486022949,51.48052764515145],[-2.718386650085449,51.47945855891032],[-2.7223777770996095,51.478496359866699],[-2.726583480834961,51.478015252732699],[-2.7321624755859377,51.47860327187394],[-2.738986015319824,51.47948528637178],[-2.744178771972656,51.48068800592616],[-2.754349708557129,51.4829864484029],[-2.756667137145996,51.483547678387747],[-2.7616453170776369,51.48458994432048]]}', true),
				),
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Overbridge',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": [[-2.621440887451172,51.443950667096615],[-2.6061630249023438,51.43367817535588]]}', true),
				),
				array (
					'type' => 'Feature',
					'properties' => array (
						'infrastructure_type' => 'transport',
						'mode_class' => 'Rail',
						'mode' => 'High speed rail',
						'intervention_class' => 'New construction',
						'intervention' => 'Underbridge',
					),
					'geometry' => json_decode ('{"type": "LineString", "coordinates": [[-2.6071929931640625, 51.43453430457666],[-2.5865936279296875,51.443094714358566]]}', true),
				),
			),
		);
		
		# Construct the JSON to be sent to the API
		$json = array ();
		
		# Value for user_input
		$json['user_input'] = array (json_encode ($input));
		
		# Values for intervention_assets
		$interventions = array ();
		foreach ($input['features'] as $intervention) {
			$interventions[] = $intervention['properties']['intervention'];
		}
		$json['intervention_assets'] = $this->databaseConnection->select ($this->settings['database'], 'intervention_assets', array ('intervention' => $interventions));
		
		# Values for intervention_assets_parameters
		$json['intervention_assets_parameters'] = $mockDataJson['intervention_assets_parameters'];
		
		# Values for asset_components
		$json['asset_components'] = $mockDataJson['asset_components'];
		
		# Values for carbon_factors
		$json['carbon_factors'] = $mockDataJson['carbon_factors'];
		
		# Values for desire_lines
		$json['desire_lines'] = $mockDataJson['desire_lines'];
		
		# Value for path_dem file
		$json['path_dem'] = '/var/www/sdca/data/dem/UKdem.tif';
		
		# Value for path_landcover file
		$json['path_landcover'] = '/var/www/sdca/data/landcover/landcover.tif';
		
		# Values for material_sites
		$json['material_sites'] = $mockDataJson['material_sites'];
		
		# Construct as string
		$stdin = json_encode ($json);
		
		# Provide base data to calculation script
		$command = $_SERVER['DOCUMENT_ROOT'] . '/api/sdca.R';
		$result = $this->createProcess ($command, $stdin);
		$result = json_decode ($result, true);
		
		# Return the result
		return $result;
	}
	
	
	# Function to handle running a command process securely without writing out any files
	public static function createProcess ($command, $string)
	{
		# Set the descriptors
		$descriptorspec = array (
			0 => array ('pipe', 'r'),  // stdin is a pipe that the child will read from
			1 => array ('pipe', 'w'),  // stdout is a pipe that the child will write to
			//2 => array ('file', '/tmp/error-output.txt', 'a'), // stderr is a file to write to - uncomment this line for debugging
		);
		
		# Assume failure unless the command works
		$returnStatus = 1;
		
		# Create the process
		$command = str_replace ("\r\n", "\n", $command);	// Standardise to Unix newlines
		$process = proc_open ($command, $descriptorspec, $pipes);
		if (is_resource ($process)) {
			fwrite ($pipes[0], $string);
			fclose ($pipes[0]);
			$output = stream_get_contents ($pipes[1]);
			fclose ($pipes[1]);
			$returnStatus = proc_close ($process);
		}
		
		# Return false as the output if the return status is a failure
		if ($returnStatus) {return false;}	// Unix return status >0 is failure
		
		# Return the output
		return $output;
	}
	
	
	# Documentation
	public static function locationsDocumentation ()
	{
		return array (
			'name' => 'Locations',
			'example' => '/api/v1/locations.json?bbox=-2.6404,51.4698,-2.5417,51.4926&zoom=15',
			'fields' => array (
				'bbox' => '%bbox',
				'zoom' => '%zoom',
			),
		);
	}
}

?>
