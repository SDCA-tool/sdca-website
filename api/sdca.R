#!/usr/bin/Rscript

# Check if new version of R package exists
remotes::install_github("sdca-tool/sdca-package", upgrade = "never", quiet = TRUE)

# Load Package
library(sdca)

# Get data values from STDIN
# See: https://datafireball.com/2013/10/10/putting-your-r-code-into-pipeline/comment-page-1/
input = file('stdin', 'r')
args = try(readLines(input, warn=FALSE), silent = TRUE)


# Alt method from:
# https://www.r-bloggers.com/2015/09/passing-arguments-to-an-r-script-from-command-lines/
#args = try(commandArgs(trailingOnly=FALSE), silent = TRUE)

# Check if the input arrived
if("try-error" %in% class(args)){
  result = list(error = gsub("[\r\n]", "", result[1]))
  result = jsonlite::toJSON(result)
  cat(result)
} else if (length(args) == 0){
  result = list(error = "API returned empty result")
  result = jsonlite::toJSON(result)
  cat(result)
} else {
  if(length(args) > 1){
    args = paste(args, collapse = "")
    result = list(error = paste(substr(args,1,50), collapse = ", "))
    result = jsonlite::toJSON(result)
    cat(result)
  } else {
    # Check if args contains a file path or json
    if(nchar(args) < 100){
      file = TRUE
    } else {
      file = FALSE
    }
    
    # Process the data
    result = try(process_results(args, file), silent = TRUE)
    
    # Check if the function worked
    if("try-error" %in% class(result)){
      result = list(error = gsub("[\r\n]", "", result[1]))
      result = jsonlite::toJSON(result)
    }
    
    # Print the result, without newlines or a count
    cat(result)
  }
}





