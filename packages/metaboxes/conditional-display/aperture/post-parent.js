/**
 * External dependencies.
 */
import of from 'callbag-of';
import startWith from 'callbag-start-with';
import distinctUntilChanged from 'callbag-distinct-until-changed';
import { addFilter } from '@wordpress/hooks';
import { select } from '@wordpress/data';
import {
	get,
	find,
	isEqual
} from 'lodash';
import {
	pipe,
	map,
	combine,
	fromEvent
} from 'callbag-basics';

/**
 * Internal dependencies.
 */
import fromSelector from '../utils/from-selector';

/**
 * The default state.
 *
 * @type {Object}
 */
const INITIAL_STATE = {
	post_ancestors: [],
	post_parent_id: 0,
	post_level: 1
};

/**
 * Extracts `post_parent_id` from the option.
 *
 * @param  {Object} option
 * @return {number}
 */
function getParentIdFromOption( option ) {
	const value = parseInt( option.value, 10 );

	return ! isNaN( value ) ? value : 0;
}

/**
 * Extracts `post_level` from the option.
 *
 * @param  {Object} option
 * @return {number}
 */
function getLevelFromOption( option ) {
	let level = 0;

	if ( option.className ) {
		const matches = option.className.match( /^level-(\d+)/ );

		if ( matches ) {
			level = parseInt( matches[ 1 ], 10 ) + 1;
		}
	}

	return level;
}

/**
 * Extracts `post_ancestors` from the option.
 *
 * @param  {Object} option
 * @return {number[]}
 */
function getAncestorsFromOption( option ) {
	const ancestors = [];

	let previousOption = option;
	let level = getLevelFromOption( option );

	while ( level > 0 && previousOption ) {
		if ( getLevelFromOption( previousOption ) !== level ) {
			previousOption = previousOption.previousSibling;

			// Skip this iteration because the option isn't an ancestor.
			continue;
		}

		const id = parseInt( previousOption.value, 10 );

		if ( id > 0 ) {
			ancestors.unshift( id );
		}

		previousOption = previousOption.previousSibling;

		level--;
	}

	return ancestors;
}

/**
 * Extracts the `post_ancestors`, `post_parent_id` & `post_level` from the select.
 *
 * @param  {Object} node
 * @return {Object}
 */
function getParentIdAncestorsAndLevelFromSelect( node ) {
	const option = node.options[ node.selectedIndex ];
	const ancestors = getAncestorsFromOption( option );
	const parentId = getParentIdFromOption( option );
	const level = getLevelFromOption( option ) + 1;

	return {
		post_ancestors: ancestors,
		post_parent_id: parentId,
		post_level: level
	};
}

/**
 * Extracts `post_ancestors` from the list.
 *
 * @param  {number}   parentId
 * @param  {Object[]} posts
 * @param  {Array}    ancestors
 * @return {number[]}
 */
function getAncestorsFromPostsList( parentId, posts, ancestors = [] ) {
	const parent = find( posts, [ 'id', parentId ] );

	if ( ! parent ) {
		return ancestors;
	}

	ancestors.unshift( parent.id );

	if ( parent.parent ) {
		return getAncestorsFromPostsList( parent.parent, posts, ancestors );
	}

	return ancestors;
}

/**
 * Defines the side effects for Classic Editor.
 */
addFilter( 'carbon-fields.conditional-display-post-parent.classic', 'carbon-fields/metaboxes', ( ) => {
	const node = document.querySelector( 'select#parent_id' );

	if ( ! node ) {
		return of( INITIAL_STATE );
	}

	return pipe(
		fromEvent( node, 'change' ),
		map( ( { target } ) => getParentIdAncestorsAndLevelFromSelect( target ) ),
		startWith( getParentIdAncestorsAndLevelFromSelect( node ) )
	);
} );

/**
 * Defines the side effects for Gutenberg.
 */
addFilter( 'carbon-fields.conditional-display-post-parent.gutenberg', 'carbon-fields/metaboxes', ( ) => {
	const { getPostType, getEntityRecords } = select( 'core' );

	return pipe(
		combine(
			fromSelector( select( 'core/editor' ).getCurrentPostId ),
			fromSelector( select( 'core/editor' ).getEditedPostAttribute, 'type' ),
			fromSelector( select( 'core/editor' ).getEditedPostAttribute, 'parent' )
		),
		distinctUntilChanged( isEqual ),
		map( ( [ postId, postTypeSlug, parentId ] ) => {
			parentId = parseInt( parentId, 10 );

			if ( isNaN( parentId ) ) {
				return INITIAL_STATE;
			}

			const postType = getPostType( postTypeSlug );
			const isHierarchical = get( postType, [ 'hierarchical' ], false );

			if ( ! isHierarchical ) {
				return INITIAL_STATE;
			}

			// Borrowed from https://github.com/WordPress/gutenberg/blob/master/packages/editor/src/components/page-attributes/parent.js
			const items = getEntityRecords( 'postType', postTypeSlug, {
				per_page: -1,
				exclude: postId,
				parent_exclude: postId,
				orderby: 'menu_order',
				order: 'asc'
			} ) || [];

			const ancestors = getAncestorsFromPostsList( parentId, items );
			const level = ancestors.length + 1;

			return {
				post_ancestors: ancestors,
				post_parent_id: parentId,
				post_level: level
			};
		} )
	);
} );
