#!/usr/bin/env python3
"""
Fix dragdrop-workspace service to handle URL-encoded activity names
by implementing URL decoding in the get_activity_configuration method.
"""

import re
from urllib.parse import unquote

# The replacement code for the get_activity_configuration method
replacement_method = '''    def get_activity_configuration(self, activity_type):
        """Get configuration for a specific activity type with URL decoding support"""
        if self.pg_connection:
            try:
                with self.pg_connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    # Try exact match first
                    cursor.execute("""
                        SELECT configuration, description, category 
                        FROM activity_configurations 
                        WHERE activity_type = %s
                    """, (activity_type,))
                    
                    result = cursor.fetchone()
                    if result:
                        logger.info(f"Loaded configuration for {activity_type} from database (exact match)")
                        return dict(result)
                    
                    # If not found and activity_type contains URL encoding, try decoded version
                    if '%' in activity_type:
                        decoded_type = unquote(activity_type)
                        cursor.execute("""
                            SELECT configuration, description, category 
                            FROM activity_configurations 
                            WHERE activity_type = %s
                        """, (decoded_type,))
                        
                        result = cursor.fetchone()
                        if result:
                            logger.info(f"Loaded configuration for {activity_type} from database (decoded as {decoded_type})")
                            return dict(result)
                        
            except Exception as e:
                logger.error(f"Error fetching activity configuration: {e}")
        
        # Fallback to generic configuration
        return self.get_generic_configuration(activity_type)'''

print("URL decoding fix for dragdrop-workspace service:")
print("This will modify the get_activity_configuration method to handle URL-encoded activity names.")
print("\nReplacement method:")
print(replacement_method)