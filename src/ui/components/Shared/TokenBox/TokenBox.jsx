import * as React from 'react';
import * as PropTypes from 'prop-types';
import Chip from 'material-ui/Chip';
import AutoComplete from 'material-ui/AutoComplete';
import IconButton from 'material-ui/IconButton';
import ActionSearch from 'material-ui/svg-icons/action/search';
import SvgClose from "material-ui/svg-icons/navigation/close";
import CircularProgress from "material-ui/CircularProgress";
import SearchResultsView from '../../SearchResultsView/SearchResultsView';
import ErrorDetails from "../ErrorDetails/ErrorDetails";
import buildQueryParser from "sirius/queryparser";
import SiriusApi from "sirius/SiriusApi";
import QueryModel from "../../../models/QueryModel";

const immutable = require('immutable');

import './TokenBox.scss';

class TokenBox extends React.Component {
  constructor(props) {
    super(props);
    this.appModel = props.appModel;
    this.viewModel = props.viewModel;

    this.queryParser = buildQueryParser(this.getSuggestionHandlers());


    this.state = {
      tokens: [],
      dataSource: [],
      open: false,
      searchString: '',
      query: null,
      hintText: '',
    };
  }

  componentDidMount() {
    this.getSuggestions([], false);
  }

  perfectMatch(dataSource, value) {
    const lowered = dataSource.map(d => {
      return d.value.toLowerCase();
    });

    const query = value.toLowerCase().trim();

    // search for value in case-insensitive fashion:
    const idx = lowered.indexOf(query);
    if (idx < 0) return null;

    // make sure value matches only one suggestion in the dropdown:
    const singleMatch = this.singleResult(dataSource, query);

    if (!singleMatch) return null;
    return dataSource[idx];
  }

  handleUpdateInput = (value, dataSource, params) => {
    this.setState({
      searchString: value,
    });

    const match = this.perfectMatch(dataSource, value);
    const isGeneOrTrait = match && (match.rule === 'GENE' || match.rule === 'TRAIT');

    if (match && !isGeneOrTrait && (!this.state.quoteInput || params.source === 'click')) {
      // clear the search box:
      this.refs.autoComplete.setState({ searchText: '' });

      // update the current tokens list:
      this.state.tokens.push({
        value: match.value,
        quoted: this.state.quoteInput
      });
      this.setState({
        tokens: this.state.tokens.slice(0),
        dataSource: [],
      });

      // fetch new suggestions:
      let showSuggestions = true;
      if (this.state.tokens[this.state.tokens.length - 1].quoted && this.state.query) {
        showSuggestions = false;
      }

      this.getSuggestions(this.state.tokens, showSuggestions);
    } else {
        // fetch new suggestions:
        const newTokens = this.state.tokens.slice(0);
        newTokens.push({
          value: value,
          quoted: this.state.quoteInput,
        });
        const newString= this.buildQueryStringFromTokens(newTokens);
        const testParse = this.queryParser.getSuggestions(newString);
        if (testParse.query !== null && params.source === 'click') {
          this.pushSearchResultsView(newTokens, newString, testParse.query);
        } else {
          this.getSuggestions(newTokens, true);
        }
        
        
    }
  };

  getSuggestionHandlers() {
    const suggestionMap = new Map();
    ['TRAIT', 'GENE', 'CELL_TYPE', 'TUMOR_SITE'].forEach(rule => {
      suggestionMap.set(rule, (searchText, maxResults) => {
        return SiriusApi.getSuggestions(rule, searchText, maxResults).then(results => {
          return results.map(value => { return { rule: rule, value: value}; });
        });
      });
    });
    return suggestionMap;
  }

  buildQueryStringFromTokens(tokens) {
    let pieces = tokens.map(token => {
      return token.quoted ? '"' + token.value + '"' : token.value;
    });
    return pieces.join(' ');
  }

  singleResult = (results, searchText) => {
    return results.filter(result => AutoComplete.fuzzyFilter(searchText, result.value)).length > 0;
  }

  getSuggestions(tokens, openOnLoad = true) {
    const searchText = this.buildQueryStringFromTokens(tokens);
    this.searchText = searchText;
    const result = this.queryParser.getSuggestions(searchText);
    
    this.appModel.pushLoading();
    result.suggestions.then(results => {
      if (this.searchText !== searchText) return;
      this.appModel.popLoading();
      
      // if a fuzzy match exists or no additional suggestions, just show the suggestion
      const fuzzyMatchExists = this.singleResult(results, searchText);
      const showCurrentResults = fuzzyMatchExists || !result.additionalSuggestions || searchText.length === 0;
          if (showCurrentResults) {
            this.setState({
              dataSource: results,
            });
          } else if (result.additionalSuggestions){
            // if we have additional suggestions (full text search)
            // fire them iff they are newer than any other promise
            this.appModel.pushLoading();
            result.additionalSuggestions.then(additionalResults => {
              this.appModel.popLoading();
                this.setState({
                  dataSource: additionalResults,
                });
            }, err => {
              this.appModel.popLoading();
            });
        }
      }, err => {
      this.appModel.popLoading();
    });

    this.setState({
      query: result.query,
      quoteInput: result.isQuoted,
      open: openOnLoad,
      hintText: result.hintText,
    });

    if (!result.query && openOnLoad) {
      setTimeout(() => {
        this.refs.autoComplete.refs.searchTextField.input.focus();
      }, 100);
    }
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (!prevState) {
      prevState = {};
    }
    return prevState;
  }

  runCurrentSearch = () => {
    this.pushSearchResultsView(this.state.tokens, this.state.searchString, this.state.query);
  }

  pushSearchResultsView = (tokens, searchString, query) => {
    const queryStr = this.buildQueryStringFromTokens(tokens) + ' ' + searchString;
    const query = new QueryModel(query);
    const uid = `search-result-${window.performance.now()}`;
    this.appModel.trackMixPanel("Run search", { 'queryStr': queryStr });
    const view = (<SearchResultsView key={uid} text={queryStr} query={query} viewModel={this.viewModel} appModel={this.appModel} />);
    this.viewModel.pushView('Search Results', query, view);
  }

  clearSearch = () => {
    this.appModel.trackMixPanel("Clear searchbox");
    this.setState({
      tokens: [],
      searchString: '',
      open: false,
      query: null,
    });
    this.refs.autoComplete.setState({ searchText: '' });
    this.getSuggestions([]);
  }

  popToken = () => {
    if (this.state.tokens.length >= 1) {
      this.state.tokens.pop();
      this.setState({
        tokens: this.state.tokens.slice(0),
        searchString: '',
      });
      this.getSuggestions(this.state.tokens);
    }
  }

  onChange = (evt) => {
    const formValue = evt.target.value;
    if (formValue.length === 0 && evt.key === 'Backspace') {
      this.popToken();
    } else if (evt.key === 'Enter' && this.state.query) {
      this.runCurrentSearch();
    }
  }

  renderToken(tokenText) {
    return (<li key={tokenText} className="token">
      <Chip
      >{tokenText}</Chip>
    </li>);
  }

  filter = (searchText, key) => {
    return key.value.toLowerCase().indexOf(searchText.toLowerCase()) !== -1 || searchText === '';
  }

  render() {
    if (this.state.error) {
      return (<ErrorDetails error={this.state.error} />);
    }
    const elements = [];
    for (let i = 0; i < this.state.tokens.length; i++) {
      const token = this.state.tokens[i];
      elements.push(this.renderToken(token.value));
    }


    // TODO: the AutoComplete component auto-closes when you click a menu item
    // to preven this I hacked in a very long menuCloseDelay time but we should fix that somehow.
    const input = (<AutoComplete
      id='search-box'
      ref='autoComplete'
      onKeyDown={this.onChange}
      openOnFocus={true}
      open={this.state.open}
      filter={AutoComplete.fuzzyFilter}
      hintText={this.state.hintText}
      menuCloseDelay={0}
      dataSource={this.state.dataSource}
      dataSourceConfig={{text: 'value', value: 'value'}}
      onUpdateInput={this.handleUpdateInput}
    />);
    const style = {
      position: 'absolute',
      right: '0px',
    };

    const drawClear = this.state.searchString.length > 0 || this.state.tokens.length > 0;
    const searchEnabled = this.state.query !== null;
    const tooltip = searchEnabled ? 'Search' : 'Enter a valid search';
    const clearButton = drawClear ? (<IconButton tooltip="Clear" onClick={this.clearSearch}><SvgClose /></IconButton>) : (<div />);
    const searchButton = (<IconButton onClick={this.runCurrentSearch} disabled={!searchEnabled} tooltip={tooltip}><ActionSearch /></IconButton>);
    const progress = this.state.loading ? (<CircularProgress size={80} thickness={5} />) : null;
    const status = (<div style={style}>
      {progress}
      {clearButton}
      {searchButton}
    </div>);
    return (<div className="token-box">{elements}<div>{input}</div>{status}</div>);
  }
}

TokenBox.propTypes = {
  appModel: PropTypes.object,
  viewModel: PropTypes.object
};

export default TokenBox;
